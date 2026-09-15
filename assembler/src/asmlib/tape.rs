//! Read TX-2 binary paper-tape images.

use std::error::Error;
use std::fmt::{self, Display, Formatter};
use std::io::{ErrorKind, Read};

use base::prelude::{
    Address, Signed18Bit, Unsigned6Bit, Unsigned18Bit, Unsigned36Bit, cycle_and_splay, split_halves,
};

use super::{BinaryChunk, reader_leader};

/// A decoded block from a TX-2 binary paper tape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TapeBlock {
    /// The first memory address written by the block.
    pub address: Address,
    /// The words written by the block.
    pub words: Vec<Unsigned36Bit>,
}

impl From<TapeBlock> for BinaryChunk {
    fn from(block: TapeBlock) -> Self {
        Self {
            address: block.address,
            words: block.words,
        }
    }
}

/// A decoded TX-2 binary paper-tape image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TapeImage {
    /// Blocks in their physical order on the tape.
    pub blocks: Vec<TapeBlock>,
    /// The address in the final block trailer.
    pub final_next: Address,
}

/// A malformed or unreadable TX-2 tape image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TapeReadError(String);

impl TapeReadError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl Display for TapeReadError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Error for TapeReadError {}

fn update_checksum(sum: Signed18Bit, word: Unsigned36Bit) -> Signed18Bit {
    let (left, right) = split_halves(word);
    sum.wrapping_add(left.reinterpret_as_signed())
        .wrapping_add(right.reinterpret_as_signed())
}

fn read_word<R: Read>(reader: &mut R) -> Result<Option<Unsigned36Bit>, TapeReadError> {
    let mut bytes = [0_u8; 6];
    let mut offset = 0;
    while offset < bytes.len() {
        match reader.read(&mut bytes[offset..]) {
            Ok(0) if offset == 0 => return Ok(None),
            Ok(0) => return Err(TapeReadError::new("the tape ends inside a 36-bit word")),
            Ok(count) => offset += count,
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(error) => {
                return Err(TapeReadError::new(format!(
                    "failed to read the tape: {error}"
                )));
            }
        }
    }

    let mut word = Unsigned36Bit::ZERO;
    for byte in bytes {
        let line = Unsigned6Bit::try_from(byte & 0o77)
            .expect("masking a tape line to six bits always succeeds");
        word = cycle_and_splay(word, line);
    }
    Ok(Some(word))
}

fn read_required_word<R: Read>(
    reader: &mut R,
    description: &str,
) -> Result<Unsigned36Bit, TapeReadError> {
    read_word(reader)?
        .ok_or_else(|| TapeReadError::new(format!("the tape ends before {description}")))
}

/// Decode and validate a TX-2 binary paper-tape image.
///
/// The function validates the standard reader leader, each block checksum,
/// the block lengths, and the absence of data after the final block.
///
/// # Errors
///
/// Returns an error when the input is not a complete, valid tape image.
pub fn read_tape<R: Read>(reader: &mut R) -> Result<TapeImage, TapeReadError> {
    for (position, expected) in reader_leader().into_iter().enumerate() {
        let actual = read_required_word(reader, "the reader leader is complete")?;
        if actual != expected {
            return Err(TapeReadError::new(format!(
                "reader leader word {position:o} is {actual:012o}, not {expected:012o}"
            )));
        }
    }

    let mut blocks = Vec::new();
    let final_next = loop {
        let header = read_required_word(reader, "a block header")?;
        let (length_representation, end) = split_halves(header);
        let length = Signed18Bit::ONE
            .checked_sub(length_representation.reinterpret_as_signed())
            .filter(|value| *value > Signed18Bit::ZERO)
            .map(|value| value.reinterpret_as_unsigned())
            .ok_or_else(|| {
                TapeReadError::new(format!("block header {header:012o} has an invalid length"))
            })?;
        let address = end
            .checked_sub(length)
            .and_then(|value| value.checked_add(Unsigned18Bit::ONE))
            .ok_or_else(|| {
                TapeReadError::new(format!("block ending at {end:06o} does not fit in memory"))
            })?;

        let mut checksum = update_checksum(Signed18Bit::ZERO, header);
        let word_count = usize::try_from(u64::from(length))
            .map_err(|_| TapeReadError::new("a tape block is too large for this host"))?;
        let mut words = Vec::with_capacity(word_count);
        for _ in 0..u64::from(length) {
            let word = read_required_word(reader, "a block body is complete")?;
            checksum = update_checksum(checksum, word);
            words.push(word);
        }
        let trailer = read_required_word(reader, "a block trailer")?;
        checksum = update_checksum(checksum, trailer);
        if !checksum.is_zero() {
            return Err(TapeReadError::new(format!(
                "block ending at {end:06o} has checksum {:06o}",
                checksum.reinterpret_as_unsigned()
            )));
        }

        let (_, next) = split_halves(trailer);
        blocks.push(TapeBlock {
            address: Address::from(address),
            words,
        });
        if next != Unsigned18Bit::from(3_u8) {
            break Address::from(next);
        }
    };

    if read_word(reader)?.is_some() {
        return Err(TapeReadError::new(
            "the tape has data after its final block",
        ));
    }

    Ok(TapeImage { blocks, final_next })
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::path::Path;

    use base::prelude::{Address, u18, u36};

    use super::{BinaryChunk, read_tape};
    use crate::{Binary, write_user_program};

    #[test]
    fn reads_an_assembler_tape() {
        let mut binary = Binary::default();
        binary.set_entry_point(Address::from(u18!(0o200_140)));
        binary.add_chunk(BinaryChunk {
            address: Address::from(u18!(0o12_345)),
            words: vec![u36!(0o123_456_654_321), u36!(0o777_000_000_001)],
        });
        let mut bytes = Vec::new();
        write_user_program(&binary, &mut bytes, Path::new("test.tape"))
            .expect("the test tape should be writable");

        let tape = read_tape(&mut Cursor::new(bytes)).expect("the test tape should be valid");

        assert_eq!(tape.final_next, Address::from(u18!(0o27)));
        assert_eq!(tape.blocks.len(), 2);
        assert_eq!(tape.blocks[1].address, Address::from(u18!(0o12_345)));
        assert_eq!(
            tape.blocks[1].words,
            vec![u36!(0o123_456_654_321), u36!(0o777_000_000_001)]
        );
    }

    #[test]
    fn rejects_trailing_data() {
        let binary = Binary::default();
        let mut bytes = Vec::new();
        write_user_program(&binary, &mut bytes, Path::new("test.tape"))
            .expect("the test tape should be writable");
        bytes.extend([0_u8; 6]);

        let error = read_tape(&mut Cursor::new(bytes)).expect_err("trailing data is invalid");

        assert!(error.to_string().contains("after its final block"));
    }
}
