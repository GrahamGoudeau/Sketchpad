//! Implementations of "Index Register Class" opcodes
//! - RSX
//! - DPX
//! - EXX
//! - AUX
//! - ADX
//! - SKX
//! - JPX
//! - JNX

use tracing::{Level, event};

use base::prelude::*;
use base::subword;

use super::alarm::{Alarm, AlarmDetails, Alarmer, BadMemOp};
use super::context::Context;
use super::control::{
    ControlUnit, OpcodeResult, ProgramCounterChange, UpdateE, sign_extend_index_value,
};
use super::exchanger::{exchanged_value_for_load, exchanged_value_for_store};
use super::memory::{MemoryUnit, MetaBitChange};

fn ones_complement_add(left: Signed18Bit, right: Signed18Bit) -> Signed18Bit {
    const MASK: u32 = 0o777_777;
    let raw =
        u32::from(left.reinterpret_as_unsigned()) + u32::from(right.reinterpret_as_unsigned());
    let with_end_around_carry = (raw & MASK) + (raw >> 18);
    Unsigned18Bit::try_from(with_end_around_carry & MASK)
        .expect("an 18-bit one's-complement sum always fits")
        .reinterpret_as_signed()
}

impl ControlUnit {
    /// Implements the EXX instruction (Opcode 014, User Handbook,
    /// page 3-18).
    pub(crate) fn op_exx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        let old_x = sign_extend_index_value(&self.regs.get_index_register(j));
        let target = self.operand_address_with_optional_defer_without_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let config = self.get_config();
        let new_x = exchanged_value_for_load(&config, &memory_word, &old_x);
        let new_memory = exchanged_value_for_store(&config, &old_x, &memory_word);
        self.memory_store_without_exchange(
            ctx,
            mem,
            &target,
            &new_memory,
            &UpdateE::No,
            &self.write_operand_metaop(),
        )?;
        if !j.is_zero() {
            self.regs
                .set_index_register(j, &right_half(new_x).reinterpret_as_signed());
        }
        Ok(OpcodeResult::default())
    }

    /// Implements the ADX instruction (Opcode 015, User Handbook,
    /// page 3-22).
    pub(crate) fn op_adx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        let target = self.operand_address_with_optional_defer_without_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let exchanged =
            exchanged_value_for_load(&self.get_config(), &memory_word, &Unsigned36Bit::ZERO);
        let sum = ones_complement_add(
            self.regs.get_index_register(j),
            subword::right_half(exchanged).reinterpret_as_signed(),
        );
        let value = join_halves(subword::left_half(exchanged), sum.reinterpret_as_unsigned());
        self.memory_store_with_exchange(
            ctx,
            mem,
            &target,
            &value,
            &memory_word,
            &UpdateE::No,
            &self.write_operand_metaop(),
        )?;
        Ok(OpcodeResult::default())
    }

    /// Implements the `DPX` instruction (Opcode 016, User Handbook,
    /// page 3-16).
    pub(crate) fn op_dpx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        let xj: Unsigned36Bit = sign_extend_index_value(&self.regs.get_index_register(j));
        let target: Address = self.operand_address_with_optional_defer_without_index(ctx, mem)?;

        // DPX is trying to perform a write.  But to do this in some
        // subword configurations, we need to read the existing value.
        match self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::No) {
            Ok((dest, _meta)) => self
                .memory_store_with_exchange(
                    ctx,
                    mem,
                    &target,
                    &xj,
                    &dest,
                    &UpdateE::Yes,
                    &MetaBitChange::None,
                )
                .map(|()| OpcodeResult::default()),
            Err(Alarm {
                sequence: _,
                details: AlarmDetails::QSAL(inst, BadMemOp::Read(addr), msg),
            }) => {
                // That read operation just failed.  So we handle this
                // as a _write_ failure, meaning that we change
                // BadMemOp::Read to BadMemOp::Write.
                self.alarm_unit.fire_if_not_masked(
                    Alarm {
                        sequence: self.regs.k,
                        details: AlarmDetails::QSAL(inst, BadMemOp::Write(addr), msg),
                    },
                    &self.regs.diagnostic_only,
                )?;
                Ok(OpcodeResult::default()) // QSAL is masked, we just carry on (the DPX instruction has no effect).
            }
            Err(other) => Err(other),
        }
    }

    /// Implements the AUX instruction (Opcode 010, User Handbook,
    /// page 3-22).
    pub(crate) fn op_aux(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        // The AUX instruction is not indexed.
        let source: Address = self.operand_address_with_optional_defer_without_index(ctx, mem)?;
        // If j == 0 nothing is going to happen (X₀ is always 0) but
        // we still need to make sure we raise an alarm if the memory
        // access is invalid.
        let (word, _extra) = self.fetch_operand_from_address_with_exchange(
            ctx,
            mem,
            &source,
            &Unsigned36Bit::ZERO,
            &UpdateE::Yes,
        )?;
        if !j.is_zero() {
            let m: Unsigned18Bit = subword::right_half(word);
            let xj: Signed18Bit = self.regs.get_index_register(j);
            let newvalue = xj.wrapping_add(m.reinterpret_as_signed());
            event!(
                Level::TRACE,
                "added current operand {m:o} to current value {xj:o} yielding value {newvalue:o} for X{j:o}",
            );
            self.regs.set_index_register(j, &newvalue);
        }
        Ok(OpcodeResult::default())
    }

    /// Implements the RSX instruction (Opcode 011, User Handbook,
    /// page 3-14).
    pub(crate) fn op_rsx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        let existing = join_halves(
            Unsigned18Bit::ZERO,
            self.regs.get_index_register(j).reinterpret_as_unsigned(),
        );
        // If j == 0 nothing is going to happen (X₀ is always 0) but
        // we still need to make sure we raise an alarm if the memory
        // access is invalid.  Se we need to perform the memory fetch
        // even when j=0.
        //
        // As shown in the RSX opcode documentation (Users Handbook,
        // page 3-14), the index bits in the instruction identify
        // which index register we're modifying, so cannot be used for
        // indexing.
        let source: Address = self.operand_address_with_optional_defer_without_index(ctx, mem)?;
        let (word, _extra) = self.fetch_operand_from_address_with_exchange(
            ctx,
            mem,
            &source,
            &existing,
            &UpdateE::Yes,
        )?;
        if !j.is_zero() {
            let xj: Signed18Bit = subword::right_half(word).reinterpret_as_signed();
            self.regs.set_index_register(j, &xj);
        }
        Ok(OpcodeResult::default())
    }

    /// Implements the SKX instruction (Opcode 012, User Handbook,
    /// page 3-24).
    pub(crate) fn op_skx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        // SKX does not cause an access to STUV memory; instead the
        // operand is the full value of the operand and defer fields
        // of the instruction.  This allows us to use SKX to mark a
        // placeholder for use with TRAP 42.
        let operand =
            Unsigned18Bit::from(self.operand_address_with_optional_defer_without_index(ctx, mem)?);
        let config = u8::from(self.regs.n.configuration());
        let old_xj = self.regs.get_index_register(j);
        let signed_operand = operand.reinterpret_as_signed();
        let negative_operand = (!operand).reinterpret_as_signed();
        let mut new_xj = None;
        let mut skip = false;
        match config & 0o7 {
            0o0 => {
                new_xj = Some(signed_operand);
            }
            0o1 => {
                new_xj = Some(negative_operand);
            }
            0o2 => {
                let result = ones_complement_add(old_xj, signed_operand);
                new_xj = Some(if old_xj.is_positive_zero() && result.is_zero() {
                    Signed18Bit::ZERO
                } else {
                    result
                });
            }
            0o3 => {
                let result = ones_complement_add(old_xj, negative_operand);
                new_xj = Some(if result.is_zero() {
                    Signed18Bit::MINUS_ZERO
                } else {
                    result
                });
            }
            0o4 => {
                skip = old_xj != signed_operand;
                if old_xj.is_positive_zero() {
                    new_xj = Some(Signed18Bit::MINUS_ZERO);
                }
            }
            0o5 => {
                skip = old_xj != negative_operand;
                if old_xj.is_negative_zero() {
                    new_xj = Some(Signed18Bit::ZERO);
                }
            }
            0o6 => {
                skip = old_xj < signed_operand && old_xj.checked_sub(signed_operand).is_some();
                if old_xj.is_positive_zero() {
                    new_xj = Some(Signed18Bit::MINUS_ZERO);
                }
            }
            0o7 => {
                skip = old_xj > negative_operand && old_xj.checked_add(signed_operand).is_some();
                if old_xj.is_negative_zero() {
                    new_xj = Some(Signed18Bit::ZERO);
                }
            }
            _ => unreachable!("the low three configuration bits cover octal 0 through 7"),
        }

        if j != 0
            && let Some(value) = new_xj
        {
            self.regs.set_index_register(j, &value);
        }

        let raises_flag = config & 0o10 != 0;
        let dismisses = config & 0o20 != 0;
        let raise_cancels_dismiss = raises_flag && self.regs.k == Some(j);
        if dismisses && !raise_cancels_dismiss {
            self.dismiss_unless_held("SKX has dismiss bit set in config syllable");
        }
        if raises_flag {
            self.regs.flags.raise(&j);
        }

        Ok(OpcodeResult {
            program_counter_change: if skip {
                Some(ProgramCounterChange::CounterUpdate)
            } else {
                None
            },
            poll_order_change: None,
            output: None,
        })
    }

    /// Implements the JPX (jump on positive index) opcode (06).
    pub(crate) fn op_jpx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let is_positive_address = |xj: &Signed18Bit| !xj.is_zero() && xj.is_positive();
        self.impl_op_jpx_jnx(ctx, is_positive_address, mem)
    }

    /// Implements the JNX (jump on positive index) opcode (07).
    pub(crate) fn op_jnx(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let is_negative_address = |xj: &Signed18Bit| xj.is_negative();
        self.impl_op_jpx_jnx(ctx, is_negative_address, mem)
    }

    // Implements JPX (opcode 06) and JNX.  Note that these opcodes
    // handle deferred addressing in a unique way.  This is described
    // on page 5-9 of the User Handbook:
    //
    // EXCEPT when the operation is JNX or JPX (codes 6 and 7), for on
    // these two operations the right half of N is used for the sign
    // extended index increment (18 bits).  (BUT if the JNX or JPX is
    // deferred, the increment is not addded until PK3 so N is not
    // changed during PK1).
    pub(crate) fn impl_op_jpx_jnx<F: FnOnce(&Signed18Bit) -> bool>(
        &mut self,
        ctx: &Context,
        predicate: F,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let j = self.regs.n.index_address();
        let xj = self.regs.get_index_register(j);
        let do_jump: bool = predicate(&xj);
        event!(
            Level::TRACE,
            "Index register {:?} contains {:?}={} (decimal), we {} jump",
            &j,
            &xj,
            i32::from(xj),
            if do_jump { "will" } else { "won't" },
        );

        // Compute the jump target (which possibly involves indexing)
        // before modifying Xj.  See note 3 on page 3-27 of the User
        // Handbook, which says
        //
        // The address of a deferred JNX or JPX is completely
        // determined before the index register is changed.  Therefore
        // a ⁻¹JPXₐ|ₐ S would jump to Sₐ as defined by the original
        // contents of Xₐ - if it jumps at all.
        let target: Address = self.resolve_operand_address(ctx, mem, Some(Unsigned6Bit::ZERO))?;
        let cf: Signed5Bit = self.regs.n.configuration().reinterpret_as_signed();
        let new_xj: Signed18Bit = xj.wrapping_add(Signed18Bit::from(cf));
        if !j.is_zero() {
            event!(
                Level::TRACE,
                "Updating index register {:?} to {:?}",
                &j,
                &new_xj
            );
            self.regs.set_index_register(j, &new_xj);
        }
        if do_jump {
            if !self.regs.n.is_held() {
                self.dismiss("JPX/JNX; did jump, hold bit is clear");
                if let Some(current_seq) = self.regs.k {
                    self.regs.flags.lower(&current_seq);
                    self.regs.current_sequence_is_runnable = false;
                }
            }
            mem.set_e_register(subword::join_halves(
                subword::left_half(mem.get_e_register()),
                Unsigned18Bit::from(self.regs.p),
            ));
            Ok(OpcodeResult {
                program_counter_change: Some(ProgramCounterChange::Jump(target)),
                poll_order_change: None,
                output: None,
            })
        } else {
            Ok(OpcodeResult::default())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::context::Context;
    use super::super::super::control::{
        ConfigurationMemorySetup, PanicOnUnmaskedAlarm, ProgramCounterChange, UpdateE,
    };
    use super::super::super::exchanger::SystemConfiguration;
    use super::super::super::memory::{MemoryMapped, MetaBitChange};
    use super::super::super::{MemoryConfiguration, MemoryUnit};
    use base::instruction::{Opcode, SymbolicInstruction};
    use base::prelude::*;
    use core::time::Duration;

    use super::ControlUnit;

    fn make_ctx() -> Context {
        Context {
            simulated_time: Duration::new(42, 42),
            real_elapsed_time: Duration::new(7, 12),
        }
    }

    fn setup(
        ctx: &Context,
        j: Unsigned6Bit,
        initial: Signed18Bit,
        mem_setup: &[(Address, Unsigned36Bit)],
        f_memory_setup: Option<&[(usize, SystemConfiguration)]>,
    ) -> (ControlUnit, MemoryUnit) {
        const COMPLAIN: &str = "failed to set up initial state";
        let mut control = ControlUnit::new(
            PanicOnUnmaskedAlarm::Yes,
            ConfigurationMemorySetup::StandardForTestingOnly,
        );
        let mut mem = MemoryUnit::new(
            ctx,
            &MemoryConfiguration {
                with_u_memory: false,
            },
        );
        if j == 0 {
            assert_eq!(initial, 0, "Cannot set X₀ to a nonzero value");
        } else {
            control.regs.set_index_register(j, &initial);
        }
        for (address, value) in mem_setup {
            control
                .memory_store_without_exchange(
                    ctx,
                    &mut mem,
                    address,
                    value,
                    &UpdateE::No,
                    &MetaBitChange::None,
                )
                .expect(COMPLAIN);
        }
        if let Some(f_mem_setup) = f_memory_setup {
            for (config_num, config) in f_mem_setup {
                control.regs.f_memory[*config_num] = *config;
            }
        }

        (control, mem)
    }

    #[test]
    fn exx_exchanges_the_selected_subword_and_sets_e_from_memory() {
        let context = make_ctx();
        let register = u6!(0o7);
        let old_x = u18!(0o155_666);
        let old_memory = u36!(0o111_222_333_444);
        let address = Address::from(u18!(0o300));
        let (mut control, mut memory) = setup(
            &context,
            register,
            old_x.reinterpret_as_signed(),
            &[(address, old_memory)],
            None,
        );
        control
            .update_n_register(
                Instruction::from(&SymbolicInstruction {
                    held: false,
                    configuration: u5!(1),
                    opcode: Opcode::Exx,
                    index: register,
                    operand_address: OperandAddress::direct(address),
                })
                .bits(),
            )
            .unwrap();

        control.op_exx(&context, &mut memory).unwrap();

        let (new_memory, _) = memory
            .fetch(&context, &address, &MetaBitChange::None)
            .unwrap();
        assert_eq!(new_memory, u36!(0o111_222_155_666));
        assert_eq!(
            control.regs.get_index_register(register),
            u18!(0o333_444).reinterpret_as_signed()
        );
        assert_eq!(memory.get_e_register(), old_memory);
    }

    #[test]
    fn op_dpx_does_not_index_its_direct_destination() {
        const COMPLAIN: &str = "failed to set up DPX test data";
        let context = make_ctx();
        let j = u6!(1);
        let direct = Address::from(u18!(0o100));
        let incorrectly_indexed = Address::from(u18!(0o107));
        let (mut control, mut mem) = setup(
            &context,
            j,
            Signed18Bit::from(7_i8),
            &[(direct, u36!(0)), (incorrectly_indexed, u36!(0))],
            None,
        );
        let instruction = SymbolicInstruction {
            held: false,
            configuration: u5!(0),
            opcode: Opcode::Dpx,
            index: j,
            operand_address: OperandAddress::direct(direct),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        control
            .op_dpx(&context, &mut mem)
            .expect("DPX should execute");

        assert_eq!(
            mem.fetch(&context, &direct, &MetaBitChange::None)
                .expect(COMPLAIN)
                .0,
            u36!(7)
        );
        assert_eq!(
            mem.fetch(&context, &incorrectly_indexed, &MetaBitChange::None)
                .expect(COMPLAIN)
                .0,
            u36!(0)
        );
    }

    #[test]
    fn op_adx_adds_an_index_register_to_memory() {
        const COMPLAIN: &str = "failed to set up ADX test data";
        let context = make_ctx();
        let j = u6!(1);
        let target = Address::from(u18!(0o100));
        let original = u36!(0o444_000_222_010);
        let (mut control, mut mem) = setup(
            &context,
            j,
            u18!(0o000_111).reinterpret_as_signed(),
            &[(target, original)],
            None,
        );
        let instruction = SymbolicInstruction {
            held: false,
            configuration: u5!(0),
            opcode: Opcode::Adx,
            index: j,
            operand_address: OperandAddress::direct(target),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        control
            .op_adx(&context, &mut mem)
            .expect("ADX should execute");

        assert_eq!(
            mem.fetch(&context, &target, &MetaBitChange::None)
                .expect(COMPLAIN)
                .0,
            u36!(0o444_000_222_121)
        );
        assert_eq!(mem.get_e_register(), original);
    }

    fn simulate_skx(
        config: u8,
        initial: Signed18Bit,
        operand: Unsigned18Bit,
    ) -> (Signed18Bit, bool) {
        const COMPLAIN: &str = "failed to set up SKX test data";
        let context = make_ctx();
        let j = u6!(1);
        let (mut control, mut mem) = setup(&context, j, initial, &[], None);
        let instruction = SymbolicInstruction {
            held: false,
            configuration: Unsigned5Bit::try_from(config).expect(COMPLAIN),
            opcode: Opcode::Skx,
            index: j,
            operand_address: OperandAddress::direct(Address::from(operand)),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        let result = control
            .op_skx(&context, &mut mem)
            .expect("SKX should execute");

        (
            control.regs.get_index_register(j),
            result.program_counter_change == Some(ProgramCounterChange::CounterUpdate),
        )
    }

    #[test]
    fn op_skx_implements_the_eight_arithmetic_and_skip_modes() {
        let three = u18!(3);
        assert_eq!(
            simulate_skx(0, Signed18Bit::from(7_i8), three),
            (Signed18Bit::from(3_i8), false)
        );
        assert_eq!(
            simulate_skx(1, Signed18Bit::from(7_i8), three),
            (Signed18Bit::from(-3_i8), false)
        );
        assert_eq!(
            simulate_skx(2, Signed18Bit::from(4_i8), three),
            (Signed18Bit::from(7_i8), false)
        );
        let (dex_zero, dex_skipped) = simulate_skx(3, Signed18Bit::from(3_i8), three);
        assert!(dex_zero.is_negative_zero());
        assert!(!dex_skipped);
        assert_eq!(
            simulate_skx(4, Signed18Bit::from(2_i8), three),
            (Signed18Bit::from(2_i8), true)
        );
        assert_eq!(
            simulate_skx(5, Signed18Bit::from(2_i8), three),
            (Signed18Bit::from(2_i8), true)
        );
        assert_eq!(
            simulate_skx(6, Signed18Bit::from(2_i8), three),
            (Signed18Bit::from(2_i8), true)
        );
        assert_eq!(
            simulate_skx(7, Signed18Bit::from(2_i8), three),
            (Signed18Bit::from(2_i8), true)
        );
    }

    #[test]
    fn op_skx_uses_the_final_deferred_address_as_its_operand() {
        const COMPLAIN: &str = "failed to set up deferred DEX test data";
        let context = make_ctx();
        let j = u6!(1);
        let pointer = Address::from(u18!(0o100));
        let final_operand = u18!(7);
        let (mut control, mut mem) = setup(
            &context,
            j,
            Signed18Bit::from(10_i8),
            &[(pointer, join_halves(Unsigned18Bit::ZERO, final_operand))],
            None,
        );
        let instruction = SymbolicInstruction {
            held: false,
            configuration: u5!(3),
            opcode: Opcode::Skx,
            index: j,
            operand_address: OperandAddress::deferred(pointer),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        control
            .op_skx(&context, &mut mem)
            .expect("deferred DEX should execute");

        assert_eq!(control.regs.get_index_register(j), Signed18Bit::from(3_i8));
    }

    #[test]
    fn op_skx_rfd_resets_raises_and_dismisses() {
        const COMPLAIN: &str = "failed to set up RFD test data";
        let context = make_ctx();
        let target_sequence = u6!(0o40);
        let current_sequence = u6!(0o52);
        let operand = u18!(0o200_153);
        let (mut control, mut mem) = setup(
            &context,
            target_sequence,
            Signed18Bit::from(7_i8),
            &[],
            None,
        );
        control.regs.k = Some(current_sequence);
        control.regs.current_sequence_is_runnable = true;
        control.regs.flags.lower_all();
        control.regs.flags.raise(&current_sequence);
        let instruction = SymbolicInstruction {
            held: false,
            configuration: u5!(0o30),
            opcode: Opcode::Skx,
            index: target_sequence,
            operand_address: OperandAddress::direct(Address::from(operand)),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        control
            .op_skx(&context, &mut mem)
            .expect("RFD should execute");

        assert_eq!(
            control.regs.get_index_register(target_sequence),
            operand.reinterpret_as_signed()
        );
        assert!(!control.regs.flags.current_flag_state(&current_sequence));
        assert!(control.regs.flags.current_flag_state(&target_sequence));
        assert!(!control.regs.current_sequence_is_runnable);
    }

    #[test]
    fn op_skx_rfd_does_not_dismiss_its_own_sequence() {
        const COMPLAIN: &str = "failed to set up current-sequence RFD test data";
        let context = make_ctx();
        let current_sequence = u6!(0o60);
        let operand = u18!(0o200_207);
        let (mut control, mut mem) = setup(
            &context,
            current_sequence,
            Signed18Bit::from(7_i8),
            &[],
            None,
        );
        control.regs.k = Some(current_sequence);
        control.regs.current_sequence_is_runnable = true;
        control.regs.flags.lower_all();
        let instruction = SymbolicInstruction {
            held: false,
            configuration: u5!(0o30),
            opcode: Opcode::Skx,
            index: current_sequence,
            operand_address: OperandAddress::direct(Address::from(operand)),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect(COMPLAIN);

        control
            .op_skx(&context, &mut mem)
            .expect("RFD for the current sequence should execute");

        assert_eq!(
            control.regs.get_index_register(current_sequence),
            operand.reinterpret_as_signed()
        );
        assert!(control.regs.flags.current_flag_state(&current_sequence));
        assert!(control.regs.current_sequence_is_runnable);
    }

    /// Simulate some AUX instructions and return the result
    /// of the addition, and the final value in the E register.
    ///
    /// # Arguments
    ///
    /// * `j` - which index register to use
    /// * `initial` - initial value of the X-register
    /// * `addends` - items to add to `initial`
    /// * `addend_lhs` - contents for the left subword of all added items
    /// * `defer` - whether the operand should be deferred
    /// * `cfg` - the system configuration to use when adding
    fn simulate_aux(
        ctx: &Context,
        j: Unsigned6Bit,
        initial: Signed18Bit,
        addends: &[Unsigned36Bit],
        defer: bool,
        f_memory_setup: Option<&[(usize, SystemConfiguration)]>,
        config_num: usize,
    ) -> (Signed18Bit, Unsigned36Bit) {
        const COMPLAIN: &str = "failed to set up AUX test data";

        // Given...
        const ADDEND_BASE: u32 = 0o101;
        let mem_setup: Vec<(Address, Unsigned36Bit)> = addends
            .iter()
            .enumerate()
            .map(|(offset, addend)| {
                let addend_address = Address::from(
                    u18!(ADDEND_BASE)
                        .wrapping_add(Unsigned18Bit::try_from(offset).expect(COMPLAIN)),
                );
                (addend_address, *addend)
            })
            .collect();
        let (mut control, mut mem) = setup(ctx, j, initial, &mem_setup, f_memory_setup);

        // When... we perform a sequence of AUX instructions
        let defer_address_bits = u18!(0o100);
        for offset in 0..(addends.len()) {
            let operand_address: OperandAddress = if defer {
                let pos: u32 = ADDEND_BASE + u32::try_from(offset).expect(COMPLAIN);
                let deferred = Unsigned18Bit::try_from(pos).expect(COMPLAIN);
                let ignored_lhs = u18!(0o500);
                // Set up the word at the deferred address
                control
                    .memory_store_without_exchange(
                        ctx,
                        &mut mem,
                        &Address::from(u18!(0o100)),
                        &join_halves(ignored_lhs, deferred),
                        &UpdateE::No,
                        &MetaBitChange::None,
                    )
                    .expect(COMPLAIN);
                OperandAddress::deferred(Address::from(defer_address_bits))
            } else {
                OperandAddress::direct(Address::from(
                    Unsigned18Bit::try_from(ADDEND_BASE + u32::try_from(offset).expect(COMPLAIN))
                        .expect(COMPLAIN),
                ))
            };
            let inst = SymbolicInstruction {
                held: false,
                configuration: Unsigned5Bit::try_from(config_num).expect(COMPLAIN),
                opcode: Opcode::Aux,
                index: j,
                operand_address,
            };
            control
                .update_n_register(Instruction::from(&inst).bits())
                .expect(COMPLAIN);
            if let Err(e) = control.op_aux(ctx, &mut mem) {
                panic!("AUX instruction failed: {e}");
            }
        }
        (control.regs.get_index_register(j), mem.get_e_register())
    }

    /// Check that AUX thinks that 0 + 1 = 1.
    #[test]
    fn op_aux_zero_plus_one_equals_one() {
        let context = make_ctx();
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            Signed18Bit::ZERO,
            &[Unsigned36Bit::ONE],
            false,
            Some(&[(1usize, SystemConfiguration::from(0_u8))]),
            1,
        );
        assert_eq!(sum, Signed18Bit::ONE);
        assert_eq!(e, Unsigned36Bit::ONE);
    }

    /// Check that AUX can correctly add negative values.
    #[test]
    fn op_aux_negative() {
        const COMPLAIN: &str = "failed to set up AUX test data";
        let context = make_ctx();
        let minus_three = Signed36Bit::from(-3).reinterpret_as_unsigned();
        let items_to_add = [Signed36Bit::from(-1).reinterpret_as_unsigned(), minus_three];
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE,                                // Use register X₁
            Signed18Bit::try_from(0o250077).expect(COMPLAIN), // initial value
            &items_to_add,
            false,
            // System configuration 0o340 uses only the right-hand
            // subword, which is how AUX behaves anyway - so this
            // should make no difference.
            Some(&[(1usize, SystemConfiguration::from(0o340_u8))]),
            1usize,
        );
        assert_eq!(sum, Signed18Bit::try_from(0o250073).expect(COMPLAIN));
        assert_eq!(e, minus_three);
    }

    /// This test is derived from example 1 on page 3-20 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_1() {
        let context = make_ctx();
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            u18!(0o000_111).reinterpret_as_signed(),
            &[u36!(0o444_000_222_010)],
            false,
            Some(&[(1usize, SystemConfiguration::from(0_u8))]),
            1,
        );
        assert_eq!(sum, u18!(0o222_121).reinterpret_as_signed());
        assert_eq!(e, u36!(0o444_000_222_010));
    }

    /// This test is derived from example 2 on page 3-20 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_2() {
        let context = make_ctx();
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE,               // Use register X₁
            u18!(0).reinterpret_as_signed(), // initial
            &[u36!(0o444_333_222_111)],
            false,
            Some(&[(2usize, SystemConfiguration::from(0o342_u8))]),
            2,
        );
        assert_eq!(sum, u18!(0o444_333).reinterpret_as_signed());
        assert_eq!(e, u36!(0o444_333_222_111));

        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            u18!(0o010_111).reinterpret_as_signed(),
            &[u36!(0o444_003_222_010)],
            false,
            Some(&[(2usize, SystemConfiguration::from(0o342_u8))]),
            2,
        );
        assert_eq!(sum, u18!(0o454_114).reinterpret_as_signed());
        assert_eq!(e, u36!(0o444_003_222_010));
    }

    /// This test is derived from example 3 on page 3-20 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_3() {
        let context = make_ctx();
        let xj = Signed18Bit::from(3_i8);
        // Q1(w) is 777, sign extended this is 777_776, which is -1.
        // Adding that to X₁ which is 3, gives 2.
        let w = u36!(0o444_333_000_776);
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            xj,
            &[w],
            false,
            Some(&[(0o13usize, SystemConfiguration::from(0o160_u8))]),
            0o13,
        );
        assert_eq!(sum, u18!(0o000_002).reinterpret_as_signed());
        assert_eq!(e, u36!(0o444_333_000_776));
    }

    /// This test is derived from example 4 on page 3-20 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_4() {
        let context = make_ctx();
        let xj = u18!(0o006_000).reinterpret_as_signed();
        // Q2(w) is -2, sign extended though the value is 775_777,
        // which is -2000 octal.
        let w = u36!(0o044_333_775_000);
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            xj,
            &[w],
            false,
            Some(&[(0o1usize, SystemConfiguration::from(0o350_u8))]),
            1,
        );
        assert_eq!(
            sum,
            u18!(0o004_000).reinterpret_as_signed(),
            "sum is incorrect"
        );
        assert_eq!(e, u36!(0o044_333_775_000), "Register E is incorrect");
    }

    /// This test is derived from example 5 on page 3-21 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_5() {
        let context = make_ctx();
        let xj = u18!(0o654_321).reinterpret_as_signed(); // X₁
        let w = u36!(0o040_030_020_010);
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            xj,                // value of X₁
            &[w],
            false,
            // standard configuration 0o21 is 0o230.
            Some(&[(0o21usize, SystemConfiguration::from(0o230_u8))]),
            0o21,
        );
        // X₁ is unchanged
        assert_eq!(sum, xj, "sum is incorrect");
        assert_eq!(e, u36!(0o040_030_020_010), "Register E is incorrect");
    }

    /// This test is derived from example 6 on page 3-21 of the Users
    /// Handbook.
    #[test]
    fn op_aux_example_6() {
        let context = make_ctx();
        let xj = u18!(0o222_111).reinterpret_as_signed(); // X₁
        let w = u36!(0o242_232_000_212);
        let (sum, e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE, // Use register X₁
            xj,                // value of X₁
            &[w],
            true, // deferred
            // standard configuration 1 is 0o340.
            Some(&[(0o1usize, SystemConfiguration::from(0o340_u8))]),
            0o1,
        );
        assert_eq!(
            sum,
            u18!(0o222_323).reinterpret_as_signed(),
            "sum is incorrect"
        );
        assert_eq!(e, w, "Register E is incorrect");
    }

    // TODO: add a test for AUX in which the operand is accessed via
    // deferred addressing.

    /// Check that AUX applies a configuration in which only q2 is
    /// active.
    #[test]
    fn op_aux_q2_only() {
        let context = make_ctx();
        let (sum, _e) = simulate_aux(
            &context,
            Unsigned6Bit::ONE,                       // Use register X₁
            u18!(0o300_555).reinterpret_as_signed(), // initial value
            &[u36!(0o020_010)],
            false,
            Some(&[(1usize, SystemConfiguration::from(u9!(0o750)))]), // 0o750: q2 only
            1usize,
        );
        // The sum should be formed from q2 of the initial value
        // (0o300) plus q2 of the addend (0o020), yielding 0o320.
        // q1 should be unchanged.
        assert_eq!(sum, u18!(0o320_555).reinterpret_as_signed());
    }

    fn simulate_rsx(
        ctx: &Context,
        j: Unsigned6Bit,
        initial: Signed18Bit,
        mem_word: &Unsigned36Bit,
        defer: bool,
        f_memory_setup: Option<&[(usize, SystemConfiguration)]>,
        config_num: usize,
    ) -> (Signed18Bit, Unsigned36Bit) {
        const COMPLAIN: &str = "failed to set up RSX test data";
        let deferred = Unsigned18Bit::try_from(0o200).expect(COMPLAIN);
        let mem_setup: Vec<(Address, Unsigned36Bit)> = vec![
            (Address::from(u18!(0o100)), *mem_word),
            (
                Address::from(deferred),
                join_halves(Unsigned18Bit::ZERO, u18!(0o100)),
            ), // for deferred case
        ];
        let (mut control, mut mem) = setup(ctx, j, initial, &mem_setup, f_memory_setup);

        let operand_address: OperandAddress = {
            if defer {
                OperandAddress::deferred(Address::from(u18!(0o200)))
            } else {
                OperandAddress::direct(Address::from(u18!(0o100)))
            }
        };

        let inst = SymbolicInstruction {
            held: false,
            configuration: Unsigned5Bit::try_from(config_num).expect(COMPLAIN),
            opcode: Opcode::Rsx,
            index: j,
            operand_address,
        };
        control
            .update_n_register(Instruction::from(&inst).bits())
            .expect(COMPLAIN);
        if let Err(e) = control.op_rsx(ctx, &mut mem) {
            panic!("RSX instruction failed: {e}");
        }
        (control.regs.get_index_register(j), mem.get_e_register())
    }

    /// Test case taken from example 1 on page 3-14 of the Users Handbook.
    #[test]
    fn op_rsx_example_1() {
        const COMPLAIN: &str = "test data should be valid";
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o444_333_222_111);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            Signed18Bit::from(20_i8),
            &w,
            false,
            Some(&[(1, SystemConfiguration::from(u9!(0o340)))]),
            1,
        );
        assert_eq!(xj, Signed18Bit::try_from(0o222_111_i32).expect(COMPLAIN));
        assert_eq!(e, w);
    }

    /// Test case taken from example 2 on page 3-14 of the Users Handbook.
    #[test]
    fn op_rsx_example_2() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o444_333_222_111);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            Signed18Bit::from(20_i8),
            &w,
            false,
            Some(&[(2, SystemConfiguration::from(u9!(0o342)))]),
            2,
        );
        assert_eq!(xj, u18!(0o444_333).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 3 on page 3-14 of the Users Handbook.
    #[test]
    fn op_rsx_example_3() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o444_333_222_111);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            u18!(0o505_404).reinterpret_as_signed(),
            &w,
            false,
            Some(&[(3, SystemConfiguration::from(u9!(0o760)))]),
            3,
        );
        assert_eq!(xj, u18!(0o505_111).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 4 on page 3-14 of the Users
    /// Handbook, in this case with a quarter having the top bit set
    #[test]
    fn op_rsx_example_4_negative() {
        let context = make_ctx();
        // Because q1 has the top bit set, the `1` sign bit is
        // extended through q2 of the destination index register.
        let w: Unsigned36Bit = u36!(0o454_453_452_451);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            u18!(0o202_101).reinterpret_as_signed(),
            &w,
            false,
            Some(&[(13, SystemConfiguration::from(u9!(0o160)))]),
            13,
        );
        assert_eq!(xj, u18!(0o777_451).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 4 on page 3-14 of the Users
    /// Handbook, in this case with a quarter having the top bit clear
    #[test]
    fn op_rsx_example_4_positive() {
        let context = make_ctx();
        // Because q1 has the top bit unset, the `0` sign bit is
        // extended through q2 of the destination index register.
        let w: Unsigned36Bit = u36!(0o454_453_452_251);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            u18!(0o402_101).reinterpret_as_signed(),
            &w,
            false,
            Some(&[(13, SystemConfiguration::from(u9!(0o160)))]),
            13,
        );
        assert_eq!(xj, u18!(0o000_251).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 5 on page 3-14 of the Users Handbook.
    #[test]
    fn op_rsx_example_5() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o454_453_452_451);
        let orig_xj = u18!(0o202_101).reinterpret_as_signed();
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            orig_xj,
            &w,
            false,
            Some(&[(21, SystemConfiguration::from(u9!(0o230)))]),
            21,
        );
        assert_eq!(xj, orig_xj); // unchanged
        assert_eq!(e, w);
    }

    /// Test case taken from example 6 on page 3-15 of the Users Handbook.
    #[test]
    fn op_rsx_example_6() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o454_453_452_451);
        let orig_xj = u18!(0o202_101).reinterpret_as_signed();
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            orig_xj,
            &w,
            false,
            // Nonstandard configuration
            Some(&[(1, SystemConfiguration::from(u9!(0o030)))]),
            1,
        );
        assert_eq!(xj, u18!(0o777_777).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 7 on page 3-15 of the Users Handbook.
    #[test]
    fn op_rsx_example_7() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o454_453_452_251);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ONE,
            u18!(0o402_101).reinterpret_as_signed(),
            &w,
            true,
            Some(&[(1, SystemConfiguration::from(u9!(0o340)))]),
            1,
        );
        assert_eq!(xj, u18!(0o452_251).reinterpret_as_signed());
        assert_eq!(e, w);
    }

    /// Test case taken from example 8 on page 3-15 of the Users Handbook.
    #[test]
    fn op_rsx_example_8() {
        let context = make_ctx();
        let w: Unsigned36Bit = u36!(0o454_453_452_451);
        let (xj, e) = simulate_rsx(
            &context,
            Unsigned6Bit::ZERO, // X₀
            Signed18Bit::ZERO,
            &w,
            false,
            Some(&[(1, SystemConfiguration::from(u9!(0o340)))]),
            1,
        );
        assert_eq!(xj, 0); // X₀ cannot be changed.
        assert_eq!(e, w);
    }
}
