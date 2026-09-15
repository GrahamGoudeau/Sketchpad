//! Implementations of Arithmetic Element opcodes.

use base::prelude::*;

use super::alarm::Alarm;
use super::context::Context;
use super::control::{ControlUnit, MemoryUnit, OpcodeResult, UpdateE};
use super::exchanger::{
    QuarterActivity, SubwordForm, SystemConfiguration, exchanged_value_for_load,
};

#[derive(Clone, Copy)]
struct Subword {
    first_quarter: u8,
    quarter_count: u8,
}

fn scale_count(raw: u16) -> i16 {
    if raw & 0o400 == 0 {
        raw as i16
    } else {
        -(((!raw) & 0o777) as i16)
    }
}

fn scale_bits(raw: u64, width: u8, count: i16, initial_overflow: bool) -> u64 {
    let sign_mask = 1_u64 << (width - 1);
    let value_mask = sign_mask - 1;
    let word_mask = (1_u64 << width) - 1;
    let mut shifted = raw & word_mask;
    let steps = count.unsigned_abs();

    if steps == 0 && initial_overflow {
        return shifted ^ sign_mask;
    }

    for step in 0..steps {
        let sign = shifted & sign_mask != 0;
        shifted = if count > 0 {
            let fill = u64::from(sign);
            (shifted & sign_mask) | ((shifted << 1) & value_mask) | fill
        } else {
            (shifted >> 1) | if sign { sign_mask } else { 0 }
        };
        if step == 0 && initial_overflow {
            shifted ^= sign_mask;
        }
    }
    shifted & word_mask
}

fn subwords(form: SubwordForm) -> &'static [Subword] {
    match form {
        SubwordForm::FullWord => &[Subword {
            first_quarter: 0,
            quarter_count: 4,
        }],
        SubwordForm::Halves => &[
            Subword {
                first_quarter: 0,
                quarter_count: 2,
            },
            Subword {
                first_quarter: 2,
                quarter_count: 2,
            },
        ],
        SubwordForm::ThreeOne => &[
            Subword {
                first_quarter: 0,
                quarter_count: 1,
            },
            Subword {
                first_quarter: 1,
                quarter_count: 3,
            },
        ],
        SubwordForm::Quarters => &[
            Subword {
                first_quarter: 0,
                quarter_count: 1,
            },
            Subword {
                first_quarter: 1,
                quarter_count: 1,
            },
            Subword {
                first_quarter: 2,
                quarter_count: 1,
            },
            Subword {
                first_quarter: 3,
                quarter_count: 1,
            },
        ],
    }
}

fn subword_is_active(activity: QuarterActivity, subword: Subword) -> bool {
    (subword.first_quarter..subword.first_quarter + subword.quarter_count)
        .any(|quarter| activity.is_active(&quarter))
}

fn scale_word(
    config: &SystemConfiguration,
    input: Unsigned36Bit,
    counts: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut output = u64::from(input);
    let mut remaining_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let mask = ((1_u64 << width) - 1) << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let count =
            scale_count(((remaining_counts >> (u32::from(sign_quarter) * 9)) & 0o777) as u16);
        let scaled = scale_bits(
            (output & mask) >> offset,
            width,
            count,
            overflow[usize::from(sign_quarter)],
        );
        output = (output & !mask) | scaled << offset;
        let count_mask = 0o777_u64 << (u32::from(sign_quarter) * 9);
        remaining_counts = (remaining_counts & !count_mask) | count_mask;
        overflow[usize::from(sign_quarter)] = false;
    }
    (
        Unsigned36Bit::try_from(output).expect("a scaled word remains 36 bits"),
        Unsigned36Bit::try_from(remaining_counts).expect("the D register remains 36 bits"),
        overflow,
    )
}

fn ones_complement_add(left: u64, right: u64, width: u8) -> (u64, u64, bool) {
    let mask = (1_u64 << width) - 1;
    let sign_mask = 1_u64 << (width - 1);
    let sum = (left & mask) + (right & mask);
    let end_around_carry = sum >> width;
    let result = ((sum & mask) + end_around_carry) & mask;

    let mut carries = 0_u64;
    let mut carry = end_around_carry;
    for bit in 0..width {
        let column_sum = ((left >> bit) & 1) + ((right >> bit) & 1) + carry;
        carry = column_sum >> 1;
        carries |= carry << bit;
    }

    let left_negative = left & sign_mask != 0;
    let right_negative = right & sign_mask != 0;
    let result_negative = result & sign_mask != 0;
    let overflow = left_negative == right_negative && result_negative != left_negative;
    (result, carries, overflow)
}

fn arithmetic_word(
    config: &SystemConfiguration,
    accumulator: Unsigned36Bit,
    operand: Unsigned36Bit,
    old_carries: Unsigned36Bit,
    mut overflow: [bool; 4],
    subtract: bool,
) -> (Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut result_word = u64::from(accumulator);
    let mut carry_word = u64::from(old_carries);
    let operand_word = u64::from(operand);

    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let left = (result_word >> offset) & field_mask;
        let mut right = (operand_word >> offset) & field_mask;
        if subtract {
            right = !right & field_mask;
        }
        let (result, carries, did_overflow) = ones_complement_add(left, right, width);
        result_word = (result_word & !word_mask) | result << offset;
        carry_word = (carry_word & !word_mask) | carries << offset;

        let sign_quarter = usize::from(subword.first_quarter + subword.quarter_count - 1);
        overflow[sign_quarter] = did_overflow;
    }

    (
        Unsigned36Bit::try_from(result_word).expect("an arithmetic result remains 36 bits"),
        Unsigned36Bit::try_from(carry_word).expect("the C register remains 36 bits"),
        overflow,
    )
}

impl ControlUnit {
    /// Implements SCA (Opcode 070, User Handbook, pages 3-38 and 3-39).
    pub(crate) fn op_sca(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        let (a, d, overflow) = scale_word(
            &self.get_config(),
            mem.get_a_register(),
            mem.get_d_register(),
            mem.overflow_indicators(),
        );
        mem.set_a_register(a);
        mem.set_d_register(d);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }

    /// Implements ADD (067) and SUB (077), User Handbook pages 3-36 and 3-37.
    pub(crate) fn op_add_or_subtract(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
        subtract: bool,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let operand =
            exchanged_value_for_load(&self.get_config(), &memory_word, &mem.get_d_register());
        let (a, c, overflow) = arithmetic_word(
            &self.get_config(),
            mem.get_a_register(),
            operand,
            mem.get_c_register(),
            mem.overflow_indicators(),
            subtract,
        );
        mem.set_a_register(a);
        mem.set_c_register(c);
        mem.set_d_register(operand);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quarter_scale_uses_each_sign_quarter_and_leaves_it_at_minus_zero() {
        let config = SystemConfiguration::try_from(0o600_u16).unwrap();
        let input = u36!(0o001_010_003_004);
        let counts = u36!(0o001_776_002_000);
        let (output, final_counts, overflow) = scale_word(&config, input, counts, [false; 4]);
        assert_eq!(output, u36!(0o002_004_014_004));
        assert_eq!(final_counts, u36!(0o777_777_777_777));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn negative_values_receive_one_bits_during_scale() {
        let config = SystemConfiguration::try_from(0o600_u16).unwrap();
        let input = u36!(0o776_776_776_776);
        let counts = u36!(0o001_776_001_776);
        let (output, _, _) = scale_word(&config, input, counts, [false; 4]);
        assert_eq!(output, u36!(0o775_777_775_777));
    }

    #[test]
    fn scale_recovers_initial_overflow_after_the_first_shift() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (output, _, overflow) = scale_word(
            &config,
            u36!(0o400_000_000_000),
            u36!(0o774_000_000_000),
            [false, false, false, true],
        );
        assert_eq!(output, u36!(0o040_000_000_000));
        assert!(!overflow[3]);
    }

    #[test]
    fn ones_complement_add_applies_end_around_carry() {
        let (result, _, overflow) = ones_complement_add(0o777, 0o001, 9);
        assert_eq!(result, 0o001);
        assert!(!overflow);
    }

    #[test]
    fn quarter_subtraction_preserves_positive_zero_exception() {
        let config = SystemConfiguration::try_from(0o600_u16).unwrap();
        let (result, _, overflow) = arithmetic_word(
            &config,
            u36!(0o000_000_000_000),
            u36!(0o777_777_777_777),
            u36!(0o000_000_000_000),
            [true; 4],
            true,
        );
        assert_eq!(result, u36!(0o000_000_000_000));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn addition_sets_the_sign_quarter_overflow_indicator() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (result, _, overflow) = arithmetic_word(
            &config,
            u36!(0o377_777_777_777),
            u36!(0o000_000_000_001),
            u36!(0o000_000_000_000),
            [false; 4],
            false,
        );
        assert_eq!(result, u36!(0o400_000_000_000));
        assert!(overflow[3]);
    }
}
