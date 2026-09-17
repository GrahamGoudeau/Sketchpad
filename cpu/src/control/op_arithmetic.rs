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

fn encode_scale_count(value: i16) -> u16 {
    if value < 0 {
        (!value.unsigned_abs()) & 0o777
    } else {
        value as u16 & 0o777
    }
}

fn scale_bits_wide(raw: u128, width: u8, count: i16, initial_overflow: bool) -> u128 {
    let sign_mask = 1_u128 << (width - 1);
    let value_mask = sign_mask - 1;
    let word_mask = (1_u128 << width) - 1;
    let mut shifted = raw & word_mask;
    let steps = count.unsigned_abs();

    if steps == 0 && initial_overflow {
        return shifted ^ sign_mask;
    }

    for step in 0..steps {
        let sign = shifted & sign_mask != 0;
        shifted = if count > 0 {
            let fill = u128::from(sign);
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

fn scale_bits(raw: u64, width: u8, count: i16, initial_overflow: bool) -> u64 {
    scale_bits_wide(u128::from(raw), width, count, initial_overflow) as u64
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

fn scale_ab_word(
    config: &SystemConfiguration,
    input_a: Unsigned36Bit,
    input_b: Unsigned36Bit,
    counts: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut output_a = u64::from(input_a);
    let mut output_b = u64::from(input_b);
    let mut remaining_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let count =
            scale_count(((remaining_counts >> (u32::from(sign_quarter) * 9)) & 0o777) as u16);
        let combined = (u128::from((output_a & word_mask) >> offset) << width)
            | u128::from((output_b & word_mask) >> offset);
        let scaled = scale_bits_wide(
            combined,
            width * 2,
            count,
            overflow[usize::from(sign_quarter)],
        );
        let scaled_a = ((scaled >> width) as u64) & field_mask;
        let scaled_b = (scaled as u64) & field_mask;
        output_a = (output_a & !word_mask) | scaled_a << offset;
        output_b = (output_b & !word_mask) | scaled_b << offset;
        let count_mask = 0o777_u64 << (u32::from(sign_quarter) * 9);
        remaining_counts = (remaining_counts & !count_mask) | count_mask;
        overflow[usize::from(sign_quarter)] = false;
    }
    (
        Unsigned36Bit::try_from(output_a).expect("the scaled A register remains 36 bits"),
        Unsigned36Bit::try_from(output_b).expect("the scaled B register remains 36 bits"),
        Unsigned36Bit::try_from(remaining_counts).expect("the D register remains 36 bits"),
        overflow,
    )
}

fn leading_sign_bits(raw: u128, width: u8, maximum: u8) -> u8 {
    let sign = raw & (1_u128 << (width - 1)) != 0;
    let mut count = 0;
    for bit in (0..width - 1).rev() {
        if (raw & (1_u128 << bit) != 0) != sign || count == maximum {
            break;
        }
        count += 1;
    }
    count
}

fn cycle_bits_wide(raw: u128, width: u8, count: i16) -> u128 {
    let mask = (1_u128 << width) - 1;
    let distance = u32::from(count.unsigned_abs()) % u32::from(width);
    if distance == 0 {
        return raw & mask;
    }
    if count > 0 {
        ((raw << distance) | (raw >> (u32::from(width) - distance))) & mask
    } else {
        ((raw >> distance) | (raw << (u32::from(width) - distance))) & mask
    }
}

fn cycle_word(
    config: &SystemConfiguration,
    input: Unsigned36Bit,
    counts: Unsigned36Bit,
) -> (Unsigned36Bit, Unsigned36Bit) {
    let activity = config.active_quarters();
    let mut output = u64::from(input);
    let mut output_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let count = scale_count(((output_counts >> (u32::from(sign_quarter) * 9)) & 0o777) as u16);
        let cycled = cycle_bits_wide(u128::from((output & word_mask) >> offset), width, count);
        output = (output & !word_mask) | (cycled as u64) << offset;
        output_counts |= 0o777_u64 << (u32::from(sign_quarter) * 9);
    }
    (
        Unsigned36Bit::try_from(output).expect("a cycled word remains 36 bits"),
        Unsigned36Bit::try_from(output_counts).expect("the D register remains 36 bits"),
    )
}

fn cycle_ab_word(
    config: &SystemConfiguration,
    input_a: Unsigned36Bit,
    input_b: Unsigned36Bit,
    counts: Unsigned36Bit,
) -> (Unsigned36Bit, Unsigned36Bit, Unsigned36Bit) {
    let activity = config.active_quarters();
    let mut output_a = u64::from(input_a);
    let mut output_b = u64::from(input_b);
    let mut output_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let count = scale_count(((output_counts >> (u32::from(sign_quarter) * 9)) & 0o777) as u16);
        let combined = (u128::from((output_a & word_mask) >> offset) << width)
            | u128::from((output_b & word_mask) >> offset);
        let cycled = cycle_bits_wide(combined, width * 2, count);
        output_a = (output_a & !word_mask) | (((cycled >> width) as u64) & field_mask) << offset;
        output_b = (output_b & !word_mask) | ((cycled as u64) & field_mask) << offset;
        output_counts |= 0o777_u64 << (u32::from(sign_quarter) * 9);
    }
    (
        Unsigned36Bit::try_from(output_a).expect("the cycled A register remains 36 bits"),
        Unsigned36Bit::try_from(output_b).expect("the cycled B register remains 36 bits"),
        Unsigned36Bit::try_from(output_counts).expect("the D register remains 36 bits"),
    )
}

fn normalize_ab_word(
    config: &SystemConfiguration,
    input_a: Unsigned36Bit,
    input_b: Unsigned36Bit,
    counts: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut output_a = u64::from(input_a);
    let mut output_b = u64::from(input_b);
    let mut output_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let overflow_index = usize::from(sign_quarter);
        let combined = (u128::from((output_a & word_mask) >> offset) << width)
            | u128::from((output_b & word_mask) >> offset);
        let nz = if overflow[overflow_index] {
            -1
        } else {
            i16::from(leading_sign_bits(combined, width * 2, width * 2 - 3))
        };
        let scaled = scale_bits_wide(combined, width * 2, nz, overflow[overflow_index]);
        let scaled_a = ((scaled >> width) as u64) & field_mask;
        let scaled_b = (scaled as u64) & field_mask;
        output_a = (output_a & !word_mask) | scaled_a << offset;
        output_b = (output_b & !word_mask) | scaled_b << offset;

        let count_offset = u32::from(sign_quarter) * 9;
        let old_count = ((output_counts >> count_offset) & 0o777) as u16;
        let new_count = encode_scale_count(scale_count(old_count) - nz);
        let count_mask = 0o777_u64 << count_offset;
        output_counts = (output_counts & !count_mask) | u64::from(new_count) << count_offset;
        overflow[overflow_index] = false;
    }
    (
        Unsigned36Bit::try_from(output_a).expect("the normalized A register remains 36 bits"),
        Unsigned36Bit::try_from(output_b).expect("the normalized B register remains 36 bits"),
        Unsigned36Bit::try_from(output_counts).expect("the D register remains 36 bits"),
        overflow,
    )
}

fn normalize_word(
    config: &SystemConfiguration,
    input: Unsigned36Bit,
    counts: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut output = u64::from(input);
    let mut output_counts = u64::from(counts);
    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_quarter = subword.first_quarter + subword.quarter_count - 1;
        let overflow_index = usize::from(sign_quarter);
        let field = (output & word_mask) >> offset;
        let nz = if overflow[overflow_index] {
            -1
        } else {
            i16::from(leading_sign_bits(u128::from(field), width, width - 2))
        };
        let scaled = scale_bits(field, width, nz, overflow[overflow_index]);
        output = (output & !word_mask) | scaled << offset;

        let count_offset = u32::from(sign_quarter) * 9;
        let old_count = ((output_counts >> count_offset) & 0o777) as u16;
        let new_count = encode_scale_count(scale_count(old_count) - nz);
        let count_mask = 0o777_u64 << count_offset;
        output_counts = (output_counts & !count_mask) | u64::from(new_count) << count_offset;
        overflow[overflow_index] = false;
    }
    (
        Unsigned36Bit::try_from(output).expect("the normalized A register remains 36 bits"),
        Unsigned36Bit::try_from(output_counts).expect("the D register remains 36 bits"),
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

fn ones_complement_multiply(left: u64, right: u64, width: u8) -> (u64, u64) {
    let mask = (1_u64 << width) - 1;
    let sign_mask = 1_u64 << (width - 1);
    let left_negative = left & sign_mask != 0;
    let right_negative = right & sign_mask != 0;
    let left_magnitude = if left_negative { !left & mask } else { left };
    let right_magnitude = if right_negative { !right & mask } else { right };
    let product = u128::from(left_magnitude) * u128::from(right_magnitude);
    let double_width = u32::from(width) * 2;
    let product_mask = (1_u128 << double_width) - 1;
    let shifted = (product << 1) & product_mask;
    let encoded = if left_negative ^ right_negative {
        !shifted & product_mask
    } else {
        shifted
    };
    let low = (encoded & u128::from(mask)) as u64;
    let high = ((encoded >> width) & u128::from(mask)) as u64;
    (high, low)
}

fn ones_complement_encode(magnitude: u128, negative: bool, width: u8) -> u64 {
    let mask = (1_u128 << width) - 1;
    let encoded = if negative {
        !magnitude & mask
    } else {
        magnitude & mask
    };
    encoded as u64
}

fn divide_word(
    config: &SystemConfiguration,
    input_a: Unsigned36Bit,
    input_b: Unsigned36Bit,
    divisor: Unsigned36Bit,
    old_c: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut output_a = u64::from(input_a);
    let mut output_b = u64::from(input_b);
    let mut output_c = u64::from(old_c);
    let divisor_word = u64::from(divisor);

    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let sign_mask = 1_u64 << (width - 1);
        let raw_a = (output_a & word_mask) >> offset;
        let raw_b = (output_b & word_mask) >> offset;
        let raw_divisor = (divisor_word & word_mask) >> offset;
        let numerator_negative = raw_a & sign_mask != 0;
        let divisor_negative = raw_divisor & sign_mask != 0;
        let combined = (u128::from(raw_a) << width) | u128::from(raw_b);
        let numerator_raw = combined >> 1;
        let numerator_width = width * 2 - 1;
        let numerator_mask = (1_u128 << numerator_width) - 1;
        let numerator_magnitude = if numerator_negative {
            !numerator_raw & numerator_mask
        } else {
            numerator_raw
        };
        let divisor_magnitude = if divisor_negative {
            !raw_divisor & field_mask
        } else {
            raw_divisor
        };
        let high_magnitude = if numerator_negative {
            !raw_a & field_mask
        } else {
            raw_a
        };
        let sign_quarter = usize::from(subword.first_quarter + subword.quarter_count - 1);

        let (quotient, remainder, did_overflow) = if divisor_magnitude == 0 {
            let quotient = if divisor_negative {
                raw_a
            } else {
                !raw_a & field_mask
            };
            (quotient, raw_b, true)
        } else {
            let quotient_magnitude = numerator_magnitude / u128::from(divisor_magnitude);
            let remainder_magnitude = numerator_magnitude % u128::from(divisor_magnitude);
            let did_overflow = high_magnitude >= divisor_magnitude;
            let quotient_negative = numerator_negative ^ divisor_negative;
            (
                ones_complement_encode(quotient_magnitude, quotient_negative, width),
                ones_complement_encode(remainder_magnitude, numerator_negative, width),
                did_overflow,
            )
        };

        output_a = (output_a & !word_mask) | quotient << offset;
        output_b = (output_b & !word_mask) | remainder << offset;
        output_c &= !word_mask;
        overflow[sign_quarter] = did_overflow;
    }

    (
        Unsigned36Bit::try_from(output_a).expect("the quotient remains 36 bits"),
        Unsigned36Bit::try_from(output_b).expect("the remainder remains 36 bits"),
        Unsigned36Bit::try_from(output_c).expect("the C register remains 36 bits"),
        overflow,
    )
}

fn multiply_word(
    config: &SystemConfiguration,
    accumulator: Unsigned36Bit,
    multiplier: Unsigned36Bit,
    old_b: Unsigned36Bit,
    old_c: Unsigned36Bit,
    mut overflow: [bool; 4],
) -> (Unsigned36Bit, Unsigned36Bit, Unsigned36Bit, [bool; 4]) {
    let activity = config.active_quarters();
    let mut a = u64::from(accumulator);
    let mut b = u64::from(old_b);
    let mut c = u64::from(old_c);
    let multiplier = u64::from(multiplier);

    for subword in subwords(config.subword_form()) {
        if !subword_is_active(activity, *subword) {
            continue;
        }
        let offset = u32::from(subword.first_quarter) * 9;
        let width = subword.quarter_count * 9;
        let field_mask = (1_u64 << width) - 1;
        let word_mask = field_mask << offset;
        let left = (a >> offset) & field_mask;
        let right = (multiplier >> offset) & field_mask;
        let (high, low) = ones_complement_multiply(left, right, width);
        a = (a & !word_mask) | high << offset;
        b = (b & !word_mask) | low << offset;
        c &= !word_mask;
        let sign_quarter = usize::from(subword.first_quarter + subword.quarter_count - 1);
        overflow[sign_quarter] = false;
    }

    (
        Unsigned36Bit::try_from(a).expect("a product high word remains 36 bits"),
        Unsigned36Bit::try_from(b).expect("a product low word remains 36 bits"),
        Unsigned36Bit::try_from(c).expect("the C register remains 36 bits"),
        overflow,
    )
}

impl ControlUnit {
    /// Executes the arithmetic operation embedded in an AOP instruction.
    pub(crate) fn op_arithmetic_on_d(
        &mut self,
        operation: u8,
        mem: &mut MemoryUnit,
    ) -> Option<OpcodeResult> {
        match operation {
            0o66 => {
                let (a, b, d, overflow) = normalize_ab_word(
                    &self.get_config(),
                    mem.get_a_register(),
                    mem.get_b_register(),
                    mem.get_d_register(),
                    mem.overflow_indicators(),
                );
                mem.set_a_register(a);
                mem.set_b_register(b);
                mem.set_d_register(d);
                mem.set_overflow_indicators(overflow);
            }
            0o67 => {
                let (a, c, overflow) = arithmetic_word(
                    &self.get_config(),
                    mem.get_a_register(),
                    mem.get_d_register(),
                    mem.get_c_register(),
                    mem.overflow_indicators(),
                    false,
                );
                mem.set_a_register(a);
                mem.set_c_register(c);
                mem.set_overflow_indicators(overflow);
            }
            _ => return None,
        }
        Some(OpcodeResult::default())
    }

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

    /// Implements SAB (Opcode 072, User Handbook, pages 3-38 and 3-39).
    pub(crate) fn op_sab(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        let (a, b, d, overflow) = scale_ab_word(
            &self.get_config(),
            mem.get_a_register(),
            mem.get_b_register(),
            mem.get_d_register(),
            mem.overflow_indicators(),
        );
        mem.set_a_register(a);
        mem.set_b_register(b);
        mem.set_d_register(d);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }

    /// Implements SCB (Opcode 071, User Handbook, pages 3-38 and 3-39).
    pub(crate) fn op_scb(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        let (b, d, _) = scale_word(
            &self.get_config(),
            mem.get_b_register(),
            mem.get_d_register(),
            [false; 4],
        );
        mem.set_b_register(b);
        mem.set_d_register(d);
        Ok(OpcodeResult::default())
    }

    /// Implements CYA, CYB, and CAB (060-062), User Handbook pages 3-42 and 3-43.
    pub(crate) fn op_cycle(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
        opcode: Opcode,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        match opcode {
            Opcode::Cya => {
                let (a, d) = cycle_word(
                    &self.get_config(),
                    mem.get_a_register(),
                    mem.get_d_register(),
                );
                mem.set_a_register(a);
                mem.set_d_register(d);
            }
            Opcode::Cyb => {
                let (b, d) = cycle_word(
                    &self.get_config(),
                    mem.get_b_register(),
                    mem.get_d_register(),
                );
                mem.set_b_register(b);
                mem.set_d_register(d);
            }
            Opcode::Cab => {
                let (a, b, d) = cycle_ab_word(
                    &self.get_config(),
                    mem.get_a_register(),
                    mem.get_b_register(),
                    mem.get_d_register(),
                );
                mem.set_a_register(a);
                mem.set_b_register(b);
                mem.set_d_register(d);
            }
            _ => unreachable!("op_cycle only accepts cycle opcodes"),
        }
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

    /// Implements MUL (076), User Handbook pages 3-60 and 3-61.
    pub(crate) fn op_multiply(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let multiplier =
            exchanged_value_for_load(&self.get_config(), &memory_word, &mem.get_d_register());
        let (a, b, c, overflow) = multiply_word(
            &self.get_config(),
            mem.get_a_register(),
            multiplier,
            mem.get_b_register(),
            mem.get_c_register(),
            mem.overflow_indicators(),
        );
        mem.set_a_register(a);
        mem.set_b_register(b);
        mem.set_c_register(c);
        mem.set_d_register(multiplier);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }

    /// Implements DIV (075), User Handbook pages 3-62 and 3-63.
    pub(crate) fn op_divide(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        let target = self.operand_address_with_optional_defer_and_index(ctx, mem)?;
        let (memory_word, _extra) =
            self.fetch_operand_from_address_without_exchange(ctx, mem, &target, &UpdateE::Yes)?;
        let divisor =
            exchanged_value_for_load(&self.get_config(), &memory_word, &mem.get_d_register());
        let (a, b, c, overflow) = divide_word(
            &self.get_config(),
            mem.get_a_register(),
            mem.get_b_register(),
            divisor,
            mem.get_c_register(),
            mem.overflow_indicators(),
        );
        mem.set_a_register(a);
        mem.set_b_register(b);
        mem.set_c_register(c);
        mem.set_d_register(divisor);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }

    /// Implements NAB (066), User Handbook pages 3-40 and 3-41.
    pub(crate) fn op_normalize_ab(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        let (a, b, d, overflow) = normalize_ab_word(
            &self.get_config(),
            mem.get_a_register(),
            mem.get_b_register(),
            mem.get_d_register(),
            mem.overflow_indicators(),
        );
        mem.set_a_register(a);
        mem.set_b_register(b);
        mem.set_d_register(d);
        mem.set_overflow_indicators(overflow);
        Ok(OpcodeResult::default())
    }

    /// Implements NOA (064), User Handbook pages 3-40 and 3-41.
    pub(crate) fn op_normalize_a(
        &mut self,
        ctx: &Context,
        mem: &mut MemoryUnit,
    ) -> Result<OpcodeResult, Alarm> {
        self.op_ldd(ctx, mem)?;
        let (a, d, overflow) = normalize_word(
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
    fn full_word_ab_scale_moves_bits_across_the_register_boundary() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, d, overflow) = scale_ab_word(
            &config,
            Unsigned36Bit::ZERO,
            u36!(0o400_000_000_000),
            u36!(0o001_000_000_000),
            [false; 4],
        );
        assert_eq!(a, u36!(0o000_000_000_001));
        assert_eq!(b, Unsigned36Bit::ZERO);
        assert_eq!(d, u36!(0o777_000_000_000));
        assert_eq!(overflow, [false; 4]);

        let (a, b, _, _) = scale_ab_word(
            &config,
            u36!(0o000_000_000_001),
            Unsigned36Bit::ZERO,
            u36!(0o776_000_000_000),
            [false; 4],
        );
        assert_eq!(a, Unsigned36Bit::ZERO);
        assert_eq!(b, u36!(0o400_000_000_000));
    }

    #[test]
    fn full_word_ab_scale_preserves_square_root_result() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, d, overflow) = scale_ab_word(
            &config,
            u36!(0o200_000_000_000),
            u36!(0o032_434_502_636),
            u36!(0o776_000_000_000),
            [false; 4],
        );
        assert_eq!(a, u36!(0o100_000_000_000));
        assert_eq!(b, u36!(0o015_216_241_317));
        assert_eq!(d, u36!(0o777_000_000_000));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn scale_b_does_not_use_or_change_overflow() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (b, d, _) = scale_word(
            &config,
            u36!(0o400_000_000_000),
            u36!(0o774_000_000_000),
            [false; 4],
        );
        assert_eq!(b, u36!(0o740_000_000_000));
        assert_eq!(d, u36!(0o777_000_000_000));
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
            [true, false, true, true],
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

    #[test]
    fn multiply_forms_the_documented_double_length_ones_complement_product() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let negative_400 = u36!(!0o400 & 0o777_777_777_777);
        let (a, b, c, overflow) = multiply_word(
            &config,
            u36!(3),
            negative_400,
            u36!(0o123_456_701_234),
            u36!(0o765_432_107_654),
            [true; 4],
        );
        assert_eq!(a, u36!(0o777_777_777_777));
        assert_eq!(b, u36!(!0o3_000 & 0o777_777_777_777));
        assert_eq!(c, Unsigned36Bit::ZERO);
        assert_eq!(overflow, [true, true, true, false]);
    }

    #[test]
    fn halfword_multiply_preserves_the_inactive_left_half() {
        let config = SystemConfiguration::try_from(0o340_u16).unwrap();
        let (a, b, c, overflow) = multiply_word(
            &config,
            u36!(0o555_666_000_003),
            u36!(0o000_000_777_773),
            u36!(0o111_222_333_444),
            u36!(0o765_432_107_654),
            [true; 4],
        );
        assert_eq!(a, u36!(0o555_666_777_777));
        assert_eq!(b, u36!(0o111_222_777_747));
        assert_eq!(c, u36!(0o765_432_000_000));
        assert_eq!(overflow, [true, false, true, true]);
    }

    #[test]
    fn multiply_preserves_the_sign_of_negative_zero() {
        let (high, low) = ones_complement_multiply(0o777, 0o001, 9);
        assert_eq!((high, low), (0o777, 0o777));
    }

    #[test]
    fn divide_uses_all_of_ab_except_the_lowest_b_bit() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, c, overflow) = divide_word(
            &config,
            Unsigned36Bit::ZERO,
            u36!(42),
            u36!(5),
            u36!(0o765_432_107_654),
            [true; 4],
        );
        assert_eq!(a, u36!(4));
        assert_eq!(b, u36!(1));
        assert_eq!(c, Unsigned36Bit::ZERO);
        assert_eq!(overflow, [true, true, true, false]);
    }

    #[test]
    fn divide_applies_algebraic_signs_to_quotient_and_remainder() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, _, overflow) = divide_word(
            &config,
            u36!(0o777_777_777_777),
            u36!(!42 & 0o777_777_777_777),
            u36!(!5 & 0o777_777_777_777),
            Unsigned36Bit::ZERO,
            [false; 4],
        );
        assert_eq!(a, u36!(4));
        assert_eq!(b, u36!(!1 & 0o777_777_777_777));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn recoverable_divide_overflow_reverses_sign_for_scale() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, _, overflow) = divide_word(
            &config,
            u36!(1),
            Unsigned36Bit::ZERO,
            u36!(1),
            Unsigned36Bit::ZERO,
            [false; 4],
        );
        assert_eq!(a, u36!(0o400_000_000_000));
        assert!(overflow[3]);

        let (a, _, _, overflow) = scale_ab_word(&config, a, b, u36!(0o776_000_000_000), overflow);
        assert_eq!(a, u36!(0o200_000_000_000));
        assert!(!overflow[3]);
    }

    #[test]
    fn normalize_ab_uses_the_seventy_significant_product_bits() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, d, overflow) = normalize_ab_word(
            &config,
            Unsigned36Bit::ZERO,
            u36!(2),
            Unsigned36Bit::ZERO,
            [false; 4],
        );
        assert_eq!(a, u36!(0o200_000_000_000));
        assert_eq!(b, Unsigned36Bit::ZERO);
        assert_eq!(d, u36!(0o672_000_000_000));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn normalize_a_moves_the_first_non_sign_bit_next_to_the_sign() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, d, overflow) = normalize_word(
            &config,
            u36!(0o000_000_000_001),
            Unsigned36Bit::ZERO,
            [false; 4],
        );
        assert_eq!(a, u36!(0o200_000_000_000));
        assert_eq!(d, u36!(0o735_000_000_000));
        assert_eq!(overflow, [false; 4]);
    }

    #[test]
    fn normalize_a_uses_the_active_subword_and_updates_its_sign_quarter() {
        let config = SystemConfiguration::try_from(0o340_u16).unwrap();
        let (a, d, overflow) = normalize_word(
            &config,
            u36!(0o123_456_000_001),
            u36!(0o222_111_000_005),
            [true, false, true, true],
        );
        assert_eq!(a, u36!(0o123_456_200_000));
        assert_eq!(d, u36!(0o222_111_757_005));
        assert_eq!(overflow, [true, false, true, true]);
    }

    #[test]
    fn cycle_ab_rotates_through_the_a_b_boundary() {
        let config = SystemConfiguration::try_from(0_u16).unwrap();
        let (a, b, d) = cycle_ab_word(
            &config,
            Unsigned36Bit::ZERO,
            u36!(0o400_000_000_000),
            u36!(0o001_000_000_000),
        );
        assert_eq!(a, u36!(1));
        assert_eq!(b, Unsigned36Bit::ZERO);
        assert_eq!(d, u36!(0o777_000_000_000));

        let (a, b, _) = cycle_ab_word(&config, a, b, u36!(0o776_000_000_000));
        assert_eq!(a, Unsigned36Bit::ZERO);
        assert_eq!(b, u36!(0o400_000_000_000));
    }
}
