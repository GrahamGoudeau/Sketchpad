//! Implementations of the bit-logic opcodes.

use base::prelude::*;

use super::super::alarm::Alarm;
use super::super::context::Context;
use super::super::exchanger::{
    exchanged_value_for_load, exchanged_value_for_load_without_sign_extension,
    exchanged_value_for_store,
};
use super::super::memory::MemoryUnit;
use super::{ControlUnit, OpcodeResult, UpdateE};

impl ControlUnit {
    /// Implements INS (055), User Handbook pages 3-48 and 3-49.
    pub(crate) fn op_insert(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::No)?;
        let config = self.get_config();
        let selected_a = exchanged_value_for_store(&config, &mem.get_a_register(), &memory_word);
        let mask = exchanged_value_for_store(&config, &mem.get_b_register(), &Unsigned36Bit::ZERO);
        let result = (memory_word & !mask) | (selected_a & mask);
        self.memory_store_without_exchange(
            ctx,
            mem,
            &target,
            &result,
            &UpdateE::No,
            &self.write_operand_metaop(),
        )?;
        mem.set_e_register(result);
        Ok(OpcodeResult::default())
    }

    /// Implements ITA, UNA, and DSA (041, 042, and 065).
    pub(crate) fn op_accumulator_logic(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
        opcode: Opcode,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let config = self.get_config();
        let old_a = mem.get_a_register();
        let operand = exchanged_value_for_load(&config, &memory_word, &old_a);
        match opcode {
            Opcode::Ita => mem.set_a_register(old_a & operand),
            Opcode::Una => mem.set_a_register(old_a | operand),
            Opcode::Dsa => {
                mem.set_a_register(old_a ^ operand);
                mem.set_c_register(mem.get_c_register() | (old_a & operand));
                let d = exchanged_value_for_load(&config, &memory_word, &mem.get_d_register());
                mem.set_d_register(d);
            }
            _ => unreachable!("op_accumulator_logic only accepts ITA, UNA, and DSA"),
        }
        Ok(OpcodeResult::default())
    }

    /// Implements ITE (opcode 040).
    ///
    /// The TX-2 Technical Manual, volume 2, section 13-3.1, states
    /// that ITE transfers the zeroes of M into E, but not the ones.
    /// Thus each active E bit is cleared where the configured memory
    /// operand is zero.  Inactive E quarters stay unchanged.  ITE does
    /// not sign-extend the operand or copy the memory word to E.
    pub(crate) fn op_ite(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::No)?;
        let config = self.get_config();
        let active_quarters = config.active_quarters();
        let operand = exchanged_value_for_load_without_sign_extension(
            &config,
            &memory_word,
            &Unsigned36Bit::ZERO,
        );

        let mut active_mask = 0_u64;
        for quarter in 0_u8..4 {
            if active_quarters.is_active(&quarter) {
                active_mask |= 0o777_u64 << (quarter * 9);
            }
        }

        let old_e = u64::from(mem.get_e_register());
        let intersection = u64::from(mem.get_e_register() & operand);
        let result = (old_e & !active_mask) | (intersection & active_mask);
        mem.set_e_register(
            Unsigned36Bit::try_from(result).expect("the ITE result must fit in 36 bits"),
        );
        Ok(OpcodeResult::default())
    }
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use base::instruction::{Instruction, Opcode, SymbolicInstruction};
    use base::prelude::*;

    use super::super::super::MemoryConfiguration;
    use super::super::super::context::Context;
    use super::super::super::control::{
        ConfigurationMemorySetup, ControlUnit, PanicOnUnmaskedAlarm, UpdateE,
    };
    use super::super::super::memory::{MemoryUnit, MetaBitChange};

    fn make_context() -> Context {
        Context {
            simulated_time: Duration::new(42, 42),
            real_elapsed_time: Duration::new(7, 12),
        }
    }

    fn run_ite(
        configuration: u8,
        memory_word: Unsigned36Bit,
        a: Unsigned36Bit,
        e: Unsigned36Bit,
    ) -> Unsigned36Bit {
        let ctx = make_context();
        let mut control = ControlUnit::new(
            PanicOnUnmaskedAlarm::Yes,
            ConfigurationMemorySetup::StandardForTestingOnly,
        );
        let mut mem = MemoryUnit::new(
            &ctx,
            &MemoryConfiguration {
                with_u_memory: false,
            },
        );
        let target = Address::from(u18!(0o100));
        control
            .memory_store_without_exchange(
                &ctx,
                &mut mem,
                &target,
                &memory_word,
                &UpdateE::No,
                &MetaBitChange::None,
            )
            .expect("test memory must accept the operand");
        mem.set_a_register(a);
        mem.set_e_register(e);
        let instruction = SymbolicInstruction {
            held: false,
            configuration: Unsigned5Bit::try_from(configuration)
                .expect("test configuration must fit"),
            opcode: Opcode::Ite,
            index: Unsigned6Bit::ZERO,
            operand_address: OperandAddress::direct(target),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect("test instruction must be valid");
        control
            .op_ite(&ctx, &mut mem)
            .expect("ITE must execute without an alarm");
        mem.get_e_register()
    }

    fn run_insert(
        memory_word: Unsigned36Bit,
        a: Unsigned36Bit,
        b: Unsigned36Bit,
    ) -> (Unsigned36Bit, Unsigned36Bit) {
        let ctx = make_context();
        let mut control = ControlUnit::new(
            PanicOnUnmaskedAlarm::Yes,
            ConfigurationMemorySetup::StandardForTestingOnly,
        );
        let mut mem = MemoryUnit::new(
            &ctx,
            &MemoryConfiguration {
                with_u_memory: false,
            },
        );
        let target = Address::from(u18!(0o100));
        control
            .memory_store_without_exchange(
                &ctx,
                &mut mem,
                &target,
                &memory_word,
                &UpdateE::No,
                &MetaBitChange::None,
            )
            .expect("test memory must accept the operand");
        mem.set_a_register(a);
        mem.set_b_register(b);
        let instruction = SymbolicInstruction {
            held: false,
            configuration: Unsigned5Bit::ZERO,
            opcode: Opcode::Ins,
            index: Unsigned6Bit::ZERO,
            operand_address: OperandAddress::direct(target),
        };
        control
            .update_n_register(Instruction::from(&instruction).bits())
            .expect("test instruction must be valid");
        control
            .op_insert(&ctx, &mut mem)
            .expect("INS must execute without an alarm");
        let (stored, _) = control
            .fetch_operand_from_address_without_exchange(&ctx, &mut mem, &target, &UpdateE::No)
            .expect("test memory must remain readable");
        (stored, mem.get_e_register())
    }

    #[test]
    fn ite_intersects_memory_with_e_in_all_quarters() {
        assert_eq!(
            run_ite(
                0,
                u36!(0o770_660_550_440),
                u36!(0o707_606_505_404),
                u36!(0o111_222_333_444),
            ),
            u36!(0o110_220_110_440),
        );
    }

    #[test]
    fn ite_changes_only_active_quarters_without_sign_extension() {
        // Standard F-memory location 011 contains configuration 0140.
        // That configuration activates the right half without permutation.
        assert_eq!(
            run_ite(
                0o11,
                u36!(0o777_777_770_770),
                u36!(0o707_707_707_707),
                u36!(0o123_456_111_222),
            ),
            u36!(0o123_456_110_220),
        );
    }

    #[test]
    fn ite_does_not_use_a() {
        let with_zero_a = run_ite(
            0,
            u36!(0o707_070_707_070),
            Unsigned36Bit::ZERO,
            u36!(0o770_660_550_440),
        );
        let with_one_a = run_ite(
            0,
            u36!(0o707_070_707_070),
            u36!(0o777_777_777_777),
            u36!(0o770_660_550_440),
        );
        assert_eq!(with_zero_a, u36!(0o700_060_500_040));
        assert_eq!(with_one_a, with_zero_a);
    }

    #[test]
    fn insert_replaces_only_bits_selected_by_b() {
        let result = run_insert(
            u36!(0o700_600_500_400),
            u36!(0o123_456_765_432),
            u36!(0o777_000_777_000),
        );
        assert_eq!(result.0, u36!(0o123_600_765_400));
        assert_eq!(result.1, result.0);
    }
}
