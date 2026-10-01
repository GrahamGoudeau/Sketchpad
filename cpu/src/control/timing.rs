//! Instruction timing.
//!
//! The durations here come from Table 7-8, "Average Duration of
//! Instructions", in the TX-2 Users Handbook (November 1963 edition;
//! the table itself is dated October 1961).  The table was produced
//! by the TX-2 timing 8000 repetitions of each operation for each
//! combination of memories:
//!
//! * P MEM: the memory holding the instruction (S or T),
//! * Δ: the memory holding an intermediate deferred address (if any),
//! * Q MEM: the memory holding the final operand (S, T, VFF, or VT).
//!
//! S is core memory, T is the fast memory, VFF is the flip-flop part
//! of V memory (the A, B, C, D, E registers), and VT is toggle
//! memory.
//!
//! Where the table measures a case directly, this module reproduces
//! the measured value.  The remaining cases are derived from the
//! table and are documented at the point of use:
//!
//! * Deferred addressing is measured only for SKX and SKM.  Every
//!   measured pair differs by 10.4 microseconds for a deferred word in
//!   S memory and by 8.4 microseconds for one in T memory.  That
//!   increment is applied per deferred cycle to every opcode.
//! * MUL, DIV, and TLY are measured for the full word and for the
//!   standard 27-bit, 18-bit, and 9-bit configurations.  The emulator
//!   selects the row by the number of active quarters.
//! * The shift and cycle instructions are measured twice: once with
//!   a zero count, which matches the plain operand-fetch cost, and
//!   once with the count that happened to be in the operand word.
//!   The handbook does not state the shift rate.  This module charges
//!   the measured zero-count cost plus 0.4 microseconds per shift
//!   step.  That rate is inferred from the per-bit cost of MUL and is
//!   an approximation.
//! * NOA and NAB are measured with and without a normalising shift.
//!   This module uses the measured shifting case.
//! * An instruction fetched from V memory, an operand in U memory,
//!   and a deferred word in V or U memory are not in the table.  They
//!   use the T-memory values.
//! * V-memory locations other than the A to E registers are treated
//!   as toggle memory.

use base::instruction::Opcode;
use base::prelude::*;

use super::memory::{T_MEMORY_START, V_MEMORY_START};

/// The memory class of an address as Table 7-8 distinguishes them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MemoryClass {
    S,
    T,
    VFF,
    VT,
}

impl MemoryClass {
    /// The column index for an operand in this memory.
    fn q_index(self) -> usize {
        match self {
            MemoryClass::S => 0,
            MemoryClass::T => 1,
            MemoryClass::VFF => 2,
            MemoryClass::VT => 3,
        }
    }

    /// The column index for an instruction fetched from this memory.
    /// The table has no V-memory column for instructions, so those use
    /// the T-memory figures.
    fn p_index(self) -> usize {
        match self {
            MemoryClass::S => 0,
            MemoryClass::T | MemoryClass::VFF | MemoryClass::VT => 1,
        }
    }
}

pub(crate) fn memory_class(addr: &Address) -> MemoryClass {
    let addr: u32 = u32::from(addr);
    if addr < T_MEMORY_START {
        MemoryClass::S
    } else if addr < V_MEMORY_START {
        // T memory, and U memory if it were fitted.
        MemoryClass::T
    } else if (0o377604..=0o377610).contains(&addr) {
        // The arithmetic element registers A, B, C, D, E.
        MemoryClass::VFF
    } else {
        MemoryClass::VT
    }
}

/// Memory references observed while an instruction executes.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct OperandTrace {
    /// Deferred address cycles whose deferred word was in S memory.
    pub(crate) deferred_in_s: u32,
    /// Deferred address cycles whose deferred word was elsewhere.
    pub(crate) deferred_elsewhere: u32,
    /// The memory holding the final operand, if the instruction
    /// resolved an operand address.
    pub(crate) operand: Option<MemoryClass>,
    /// The largest shift count applied by a shift or cycle
    /// instruction.
    pub(crate) shift_steps: Option<u32>,
}

impl OperandTrace {
    pub(crate) fn record_deferred_word(&mut self, addr: &Address) {
        match memory_class(addr) {
            MemoryClass::S => self.deferred_in_s += 1,
            _ => self.deferred_elsewhere += 1,
        }
    }

    pub(crate) fn record_operand(&mut self, addr: &Address) {
        self.operand = Some(memory_class(addr));
    }

    pub(crate) fn record_shift_steps(&mut self, steps: u32) {
        self.shift_steps = Some(self.shift_steps.map_or(steps, |prior| prior.max(steps)));
    }
}

/// Everything the duration estimate needs to know about one executed
/// instruction.
#[derive(Clone, Copy, Debug)]
pub(crate) struct InstructionTiming {
    /// The address the instruction was fetched from.
    pub(crate) instruction_from: Address,
    /// The opcode, or `None` for an invalid instruction word.
    pub(crate) opcode: Option<Opcode>,
    /// For OPR, whether the instruction is AOP rather than IOS.
    pub(crate) opr_is_aop: bool,
    /// The number of active quarters in the instruction's
    /// configuration (1 to 4).
    pub(crate) active_quarters: u8,
    /// The memory references made while executing the instruction.
    pub(crate) trace: OperandTrace,
}

// Durations are in tenths of a microsecond.
//
// Rows without an operand are indexed by P memory: [S, T].
const T_AOP: [u16; 2] = [80, 60];
const T_IOS: [u16; 2] = [92, 72];
const T_JMP: [u16; 2] = [76, 56];
const T_JPA_JNA_JOV: [u16; 2] = [80, 60];
const T_JNX_JPX: [u16; 2] = [96, 76];
const T_SKX: [u16; 2] = [100, 80];

// Rows with an operand are indexed by (Q memory, P memory):
// [S/S, T/S, S/T, T/T, S/VFF, T/VFF, S/VT, T/VT], where the first
// letter of each pair is the P memory and the second the Q memory.
type OperandRow = [u16; 8];
const T_AUX: OperandRow = [136, 116, 116, 96, 124, 104, 120, 100];
const T_RSX: OperandRow = [128, 108, 108, 88, 116, 96, 112, 92];
const T_ADX: OperandRow = [160, 100, 100, 120, 108, 88, 104, 84];
const T_DPX: OperandRow = [140, 76, 76, 100, 84, 64, 80, 60];
const T_EXX: OperandRow = [140, 112, 112, 100, 116, 96, 112, 92];
const T_SKM: OperandRow = [148, 96, 96, 108, 104, 84, 100, 80];
/// LDA, LDB, LDC, LDD, LDE, ITA, UNA, DSA, ITE.
const T_LOAD: OperandRow = [128, 64, 68, 88, 68, 52, 68, 48];
/// SPF, SPG, SED.
const T_SPF_SPG_SED: OperandRow = [128, 96, 96, 88, 104, 84, 100, 80];
/// STA, STB, STC, STD, STE, EXA.
const T_STORE: OperandRow = [140, 76, 68, 100, 68, 52, 68, 48];
const T_FLF: OperandRow = [140, 76, 68, 100, 68, 60, 68, 48];
const T_FLG: OperandRow = [156, 88, 84, 116, 84, 80, 84, 68];
const T_TSD: OperandRow = [144, 88, 76, 104, 76, 88, 76, 88];
const T_INS: OperandRow = [152, 88, 68, 112, 68, 64, 68, 60];
const T_COM: OperandRow = [148, 84, 68, 108, 68, 64, 68, 60];
const T_ADD_SUB: OperandRow = [128, 64, 68, 88, 68, 56, 68, 48];
/// Indexed by active quarter count: [9-bit, 18-bit, 27-bit, 36-bit].
const T_MUL: [OperandRow; 4] = [
    [128, 112, 100, 88, 100, 96, 100, 96],
    [160, 144, 116, 120, 132, 128, 132, 128],
    [176, 176, 164, 152, 164, 160, 164, 160],
    [208, 208, 196, 200, 196, 208, 196, 192],
];
const T_DIV: [OperandRow; 4] = [
    [224, 224, 196, 200, 212, 208, 196, 208],
    [432, 432, 420, 408, 420, 416, 420, 416],
    [608, 608, 596, 600, 596, 608, 596, 592],
    [800, 800, 772, 776, 788, 784, 772, 784],
];
const T_TLY: [OperandRow; 4] = [
    [128, 80, 68, 88, 68, 80, 68, 80],
    [128, 112, 100, 120, 100, 112, 100, 96],
    [160, 160, 132, 136, 148, 144, 132, 144],
    [192, 192, 164, 168, 180, 176, 180, 176],
];
/// SCA, SCB, SAB, CYA, CYB, CAB with a zero shift count.
const T_SHIFT_BASE: OperandRow = [128, 80, 68, 88, 68, 80, 68, 80];
/// Inferred per-step shift cost; see the module documentation.
const T_SHIFT_STEP: u64 = 4;
const T_NOA: OperandRow = [192, 192, 180, 184, 180, 192, 180, 176];
const T_NAB: OperandRow = [336, 336, 324, 328, 324, 336, 324, 320];

/// Increment per deferred address cycle, measured from the SKX and
/// SKM rows: [deferred word in S, deferred word in T].
const T_DEFER: [u16; 2] = [104, 84];

/// Fallback for an instruction word that does not decode.
const T_INVALID: [u16; 2] = [80, 60];

fn operand_row(row: &OperandRow, p: MemoryClass, q: Option<MemoryClass>) -> u64 {
    // An instruction that normally has an operand but whose operand
    // memory was not observed (for example because it alarmed before
    // resolving its address) is charged as if the operand were in the
    // instruction's own memory.
    let q = q.unwrap_or(match p {
        MemoryClass::S => MemoryClass::S,
        _ => MemoryClass::T,
    });
    u64::from(row[q.q_index() * 2 + p.p_index()])
}

fn width_index(active_quarters: u8) -> usize {
    match active_quarters {
        0 | 1 => 0,
        2 => 1,
        3 => 2,
        _ => 3,
    }
}

/// Estimate the duration of an executed instruction in nanoseconds.
pub(crate) fn instruction_duration_ns(timing: &InstructionTiming) -> u64 {
    let p = memory_class(&timing.instruction_from);
    let q = timing.trace.operand;
    let pi = p.p_index();
    let width = width_index(timing.active_quarters);
    let mut tenths: u64 = match timing.opcode {
        None => u64::from(T_INVALID[pi]),
        Some(opcode) => match opcode {
            Opcode::Opr => {
                if timing.opr_is_aop {
                    u64::from(T_AOP[pi])
                } else {
                    u64::from(T_IOS[pi])
                }
            }
            Opcode::Jmp => u64::from(T_JMP[pi]),
            Opcode::Jpa | Opcode::Jna | Opcode::Jov => u64::from(T_JPA_JNA_JOV[pi]),
            Opcode::Jnx | Opcode::Jpx => u64::from(T_JNX_JPX[pi]),
            Opcode::Skx => u64::from(T_SKX[pi]),
            Opcode::Aux => operand_row(&T_AUX, p, q),
            Opcode::Rsx => operand_row(&T_RSX, p, q),
            Opcode::Adx => operand_row(&T_ADX, p, q),
            Opcode::Dpx => operand_row(&T_DPX, p, q),
            Opcode::Exx => operand_row(&T_EXX, p, q),
            Opcode::Skm => operand_row(&T_SKM, p, q),
            Opcode::Lda
            | Opcode::Ldb
            | Opcode::Ldc
            | Opcode::Ldd
            | Opcode::Lde
            | Opcode::Ita
            | Opcode::Una
            | Opcode::Dsa
            | Opcode::Ite => operand_row(&T_LOAD, p, q),
            Opcode::Spf | Opcode::Spg | Opcode::Sed => operand_row(&T_SPF_SPG_SED, p, q),
            Opcode::Sta | Opcode::Stb | Opcode::Stc | Opcode::Std | Opcode::Ste | Opcode::Exa => {
                operand_row(&T_STORE, p, q)
            }
            Opcode::Flf => operand_row(&T_FLF, p, q),
            Opcode::Flg => operand_row(&T_FLG, p, q),
            Opcode::Tsd => operand_row(&T_TSD, p, q),
            Opcode::Ins => operand_row(&T_INS, p, q),
            Opcode::Com => operand_row(&T_COM, p, q),
            Opcode::Add | Opcode::Sub => operand_row(&T_ADD_SUB, p, q),
            Opcode::Mul => operand_row(&T_MUL[width], p, q),
            Opcode::Div => operand_row(&T_DIV[width], p, q),
            Opcode::Tly => operand_row(&T_TLY[width], p, q),
            Opcode::Sca | Opcode::Scb | Opcode::Sab | Opcode::Cya | Opcode::Cyb | Opcode::Cab => {
                operand_row(&T_SHIFT_BASE, p, q)
                    + T_SHIFT_STEP * u64::from(timing.trace.shift_steps.unwrap_or(0))
            }
            Opcode::Noa => operand_row(&T_NOA, p, q),
            Opcode::Nab => operand_row(&T_NAB, p, q),
        },
    };
    tenths += u64::from(T_DEFER[0]) * u64::from(timing.trace.deferred_in_s);
    tenths += u64::from(T_DEFER[1]) * u64::from(timing.trace.deferred_elsewhere);

    // Convert from tenths of a microsecond to nanoseconds.
    tenths * 100
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address(value: u32) -> Address {
        Address::from(Unsigned18Bit::try_from(value).expect("test address must fit"))
    }

    fn timing(
        from: u32,
        opcode: Opcode,
        active_quarters: u8,
        trace: OperandTrace,
    ) -> InstructionTiming {
        InstructionTiming {
            instruction_from: address(from),
            opcode: Some(opcode),
            opr_is_aop: false,
            active_quarters,
            trace,
        }
    }

    fn with_operand(operand: u32) -> OperandTrace {
        OperandTrace {
            operand: Some(memory_class(&address(operand))),
            ..OperandTrace::default()
        }
    }

    const S_ADDR: u32 = 0o010000;
    const T_ADDR: u32 = 0o200000;
    const A_REGISTER: u32 = 0o377604;
    const TOGGLE: u32 = 0o377700;

    #[test]
    fn direct_jump_times_match_handbook_table_7_8() {
        let t = OperandTrace::default();
        assert_eq!(instruction_duration_ns(&timing(S_ADDR, Opcode::Jmp, 4, t)), 7_600);
        assert_eq!(instruction_duration_ns(&timing(T_ADDR, Opcode::Jmp, 4, t)), 5_600);
    }

    #[test]
    fn a_jump_target_memory_does_not_change_the_jump_time() {
        // The table lists JMP without an operand column.  The
        // resolved target address is recorded as an operand but must
        // not be charged as one.
        assert_eq!(
            instruction_duration_ns(&timing(T_ADDR, Opcode::Jmp, 4, with_operand(S_ADDR))),
            5_600
        );
    }

    #[test]
    fn opr_distinguishes_ios_from_aop() {
        let mut t = timing(S_ADDR, Opcode::Opr, 4, OperandTrace::default());
        assert_eq!(instruction_duration_ns(&t), 9_200);
        t.opr_is_aop = true;
        assert_eq!(instruction_duration_ns(&t), 8_000);
        t.instruction_from = address(T_ADDR);
        assert_eq!(instruction_duration_ns(&t), 6_000);
    }

    #[test]
    fn loads_follow_every_memory_combination() {
        let f = |from, operand| {
            instruction_duration_ns(&timing(from, Opcode::Lda, 4, with_operand(operand)))
        };
        assert_eq!(f(S_ADDR, S_ADDR), 12_800);
        assert_eq!(f(T_ADDR, S_ADDR), 6_400);
        assert_eq!(f(S_ADDR, T_ADDR), 6_800);
        assert_eq!(f(T_ADDR, T_ADDR), 8_800);
        assert_eq!(f(S_ADDR, A_REGISTER), 6_800);
        assert_eq!(f(T_ADDR, A_REGISTER), 5_200);
        assert_eq!(f(S_ADDR, TOGGLE), 6_800);
        assert_eq!(f(T_ADDR, TOGGLE), 4_800);
    }

    #[test]
    fn multiply_and_divide_follow_the_configuration_width() {
        let mul = |quarters| {
            instruction_duration_ns(&timing(S_ADDR, Opcode::Mul, quarters, with_operand(S_ADDR)))
        };
        assert_eq!(mul(4), 20_800);
        assert_eq!(mul(3), 17_600);
        assert_eq!(mul(2), 16_000);
        assert_eq!(mul(1), 12_800);
        let div = |quarters| {
            instruction_duration_ns(&timing(T_ADDR, Opcode::Div, quarters, with_operand(T_ADDR)))
        };
        assert_eq!(div(4), 77_600);
        assert_eq!(div(3), 60_000);
        assert_eq!(div(2), 40_800);
        assert_eq!(div(1), 20_000);
    }

    #[test]
    fn deferred_cycles_add_the_measured_skx_and_skm_increments() {
        let direct =
            instruction_duration_ns(&timing(S_ADDR, Opcode::Skx, 4, OperandTrace::default()));
        assert_eq!(direct, 10_000);
        let via_s = OperandTrace {
            deferred_in_s: 1,
            ..OperandTrace::default()
        };
        assert_eq!(instruction_duration_ns(&timing(S_ADDR, Opcode::Skx, 4, via_s)), 20_400);
        let via_t = OperandTrace {
            deferred_elsewhere: 1,
            ..OperandTrace::default()
        };
        assert_eq!(instruction_duration_ns(&timing(S_ADDR, Opcode::Skx, 4, via_t)), 18_400);
        assert_eq!(instruction_duration_ns(&timing(T_ADDR, Opcode::Skx, 4, via_s)), 18_400);
        assert_eq!(instruction_duration_ns(&timing(T_ADDR, Opcode::Skx, 4, via_t)), 16_400);

        // SKM from S memory with the operand in T memory: 9.6 direct,
        // 20.0 via S, 18.0 via T.
        let skm = |trace| instruction_duration_ns(&timing(S_ADDR, Opcode::Skm, 4, trace));
        assert_eq!(skm(with_operand(T_ADDR)), 9_600);
        assert_eq!(
            skm(OperandTrace {
                deferred_in_s: 1,
                ..with_operand(T_ADDR)
            }),
            20_000
        );
        assert_eq!(
            skm(OperandTrace {
                deferred_elsewhere: 1,
                ..with_operand(T_ADDR)
            }),
            18_000
        );
    }

    #[test]
    fn a_chain_of_deferred_cycles_is_charged_per_cycle() {
        let chain = OperandTrace {
            deferred_in_s: 2,
            deferred_elsewhere: 1,
            ..with_operand(S_ADDR)
        };
        assert_eq!(
            instruction_duration_ns(&timing(S_ADDR, Opcode::Lda, 4, chain)),
            12_800 + 2 * 10_400 + 8_400
        );
    }

    #[test]
    fn shifts_charge_the_zero_count_cost_plus_each_step() {
        let zero =
            instruction_duration_ns(&timing(S_ADDR, Opcode::Cya, 4, with_operand(S_ADDR)));
        assert_eq!(zero, 12_800);
        let nine = OperandTrace {
            shift_steps: Some(9),
            ..with_operand(S_ADDR)
        };
        assert_eq!(
            instruction_duration_ns(&timing(S_ADDR, Opcode::Cya, 4, nine)),
            12_800 + 3_600
        );
    }

    #[test]
    fn an_unobserved_operand_is_charged_in_the_instruction_memory() {
        assert_eq!(
            instruction_duration_ns(&timing(S_ADDR, Opcode::Lda, 4, OperandTrace::default())),
            12_800
        );
        assert_eq!(
            instruction_duration_ns(&timing(T_ADDR, Opcode::Lda, 4, OperandTrace::default())),
            8_800
        );
    }
}
