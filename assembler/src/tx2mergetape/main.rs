//! Merge several TX-2 binary paper tapes into one ordered load image.

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::ffi::OsString;
use std::fmt::{self, Display, Formatter};
use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use assembler::{Binary, BinaryChunk, TapeImage, read_tape, write_user_program};
use base::prelude::{Address, Unsigned18Bit, Unsigned36Bit};
use clap::{ArgAction, Parser};

#[derive(Debug)]
struct Fail(String);

impl Display for Fail {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Error for Fail {}

/// Merge TX-2 binary paper-tape images in load order.
#[derive(Parser, Debug)]
#[command(version, about)]
struct Cli {
    /// Tape images in their intended load order.
    #[arg(action = ArgAction::Append, required = true)]
    inputs: Vec<OsString>,

    /// File to which the merged tape is written.
    #[arg(short = 'o', long, action = ArgAction::Set)]
    output: OsString,

    /// Octal address at which the merged program starts.
    #[arg(long, action = ArgAction::Set)]
    entry: String,

    /// Permit a later tape to replace this octal memory address.
    #[arg(long, action = ArgAction::Append)]
    allow_overwrite: Vec<String>,

    /// Copy one input's inclusive range as INPUT:FROM:THROUGH:TO.
    #[arg(long, action = ArgAction::Append)]
    relocate_input_range: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Relocation {
    input_index: usize,
    source_start: Address,
    source_end: Address,
    target_start: Address,
}

#[derive(Debug, Clone)]
struct WordOrigin {
    word: Unsigned36Bit,
    input_index: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Overwrite {
    address: Address,
    old_word: Unsigned36Bit,
    old_input_index: usize,
    new_word: Unsigned36Bit,
    new_input_index: usize,
}

#[derive(Debug)]
struct MergeResult {
    binary: Binary,
    identical_overlaps: usize,
    overwrites: Vec<Overwrite>,
    relocated_words: usize,
}

fn parse_octal_address(value: &str) -> Result<Address, Fail> {
    let value = value.trim();
    let number = u32::from_str_radix(value, 8)
        .map_err(|_| Fail(format!("address '{value}' is not an octal number")))?;
    Address::try_from(number).map_err(|_| Fail(format!("address '{value}' is too large")))
}

fn parse_relocation(value: &str) -> Result<Relocation, Fail> {
    let parts = value.split(':').collect::<Vec<_>>();
    let [input_index, source_start, source_end, target_start] = parts.as_slice() else {
        return Err(Fail(format!(
            "relocation '{value}' must have the form INPUT:FROM:THROUGH:TO"
        )));
    };
    let input_number = input_index
        .parse::<usize>()
        .map_err(|_| Fail(format!("relocation input '{input_index}' is not a number")))?;
    let input_index = input_number
        .checked_sub(1)
        .ok_or_else(|| Fail("relocation input numbers start at 1".to_string()))?;
    let relocation = Relocation {
        input_index,
        source_start: parse_octal_address(source_start)?,
        source_end: parse_octal_address(source_end)?,
        target_start: parse_octal_address(target_start)?,
    };
    if relocation.source_end < relocation.source_start {
        return Err(Fail(format!("relocation '{value}' ends before it starts")));
    }
    Ok(relocation)
}

fn program_blocks(tape: &TapeImage, input_index: usize) -> Result<&[assembler::TapeBlock], Fail> {
    let Some((begin, program)) = tape.blocks.split_first() else {
        return Err(Fail(format!(
            "input {} has no tape blocks",
            input_index + 1
        )));
    };
    if begin.address != Address::from(Unsigned18Bit::from(0o27_u8)) || begin.words.len() != 2 {
        return Err(Fail(format!(
            "input {} does not start with the two-word M4 block at 000027",
            input_index + 1
        )));
    }
    Ok(program)
}

fn merge_images(
    tapes: &[TapeImage],
    entry: Address,
    allowed_overwrites: &BTreeSet<Address>,
    relocations: &[Relocation],
) -> Result<MergeResult, Fail> {
    let mut memory: BTreeMap<Address, WordOrigin> = BTreeMap::new();
    let mut identical_overlaps = 0_usize;
    let mut overwrites = Vec::new();
    let mut used_overwrite_permissions = BTreeSet::new();

    for (input_index, tape) in tapes.iter().enumerate() {
        for block in program_blocks(tape, input_index)? {
            let start = u32::from(block.address);
            for (offset, word) in block.words.iter().copied().enumerate() {
                let offset = u32::try_from(offset)
                    .map_err(|_| Fail("a tape block is too large".to_string()))?;
                let address = Address::try_from(
                    start
                        .checked_add(offset)
                        .ok_or_else(|| Fail("a tape block address overflows".to_string()))?,
                )
                .map_err(|_| Fail("a tape block extends past address 777777".to_string()))?;
                match memory.get_mut(&address) {
                    None => {
                        memory.insert(address, WordOrigin { word, input_index });
                    }
                    Some(previous) if previous.word == word => {
                        identical_overlaps = identical_overlaps.saturating_add(1);
                    }
                    Some(previous) if allowed_overwrites.contains(&address) => {
                        overwrites.push(Overwrite {
                            address,
                            old_word: previous.word,
                            old_input_index: previous.input_index,
                            new_word: word,
                            new_input_index: input_index,
                        });
                        *previous = WordOrigin { word, input_index };
                        used_overwrite_permissions.insert(address);
                    }
                    Some(previous) => {
                        return Err(Fail(format!(
                            "input {} conflicts with input {} at {address:06o}: {:012o} != {word:012o}; use --allow-overwrite {address:06o} only after you verify the load order",
                            input_index + 1,
                            previous.input_index + 1,
                            previous.word
                        )));
                    }
                }
            }
        }
    }

    let unused: Vec<_> = allowed_overwrites
        .difference(&used_overwrite_permissions)
        .copied()
        .collect();
    if !unused.is_empty() {
        let values = unused
            .iter()
            .map(|address| format!("{address:06o}"))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(Fail(format!(
            "the permitted overwrite addresses did not conflict: {values}"
        )));
    }

    let mut relocated_words = 0_usize;
    for relocation in relocations {
        let tape = tapes.get(relocation.input_index).ok_or_else(|| {
            Fail(format!(
                "relocation input {} does not exist",
                relocation.input_index + 1
            ))
        })?;
        let mut source_words = BTreeMap::new();
        for block in program_blocks(tape, relocation.input_index)? {
            let start = u32::from(block.address);
            for (offset, word) in block.words.iter().copied().enumerate() {
                let offset = u32::try_from(offset)
                    .map_err(|_| Fail("a tape block is too large".to_string()))?;
                let address = Address::try_from(start + offset)
                    .map_err(|_| Fail("a tape block address is too large".to_string()))?;
                source_words.insert(address, word);
            }
        }
        let source_start = u32::from(relocation.source_start);
        let source_end = u32::from(relocation.source_end);
        let target_start = u32::from(relocation.target_start);
        let word_count = source_end - source_start + 1;
        let target_end = target_start
            .checked_add(word_count - 1)
            .ok_or_else(|| Fail("a relocated range address overflows".to_string()))?;
        Address::try_from(target_end)
            .map_err(|_| Fail("a relocated range extends past address 777777".to_string()))?;

        let mut relocated = Vec::with_capacity(word_count as usize);
        let mut populated_source_words = 0_usize;
        for offset in 0..word_count {
            let source = Address::try_from(source_start + offset)
                .map_err(|_| Fail("a relocation source address is too large".to_string()))?;
            let word = source_words
                .get(&source)
                .copied()
                .inspect(|_| populated_source_words = populated_source_words.saturating_add(1))
                .unwrap_or(Unsigned36Bit::ZERO);
            relocated.push(WordOrigin {
                word,
                input_index: relocation.input_index,
            });
        }
        if populated_source_words == 0 {
            return Err(Fail(format!(
                "relocation source {:06o} through {:06o} has no words in input {}",
                relocation.source_start,
                relocation.source_end,
                relocation.input_index + 1
            )));
        }
        for (offset, origin) in relocated.into_iter().enumerate() {
            let offset = u32::try_from(offset)
                .map_err(|_| Fail("a relocated range is too large".to_string()))?;
            let target = Address::try_from(target_start + offset)
                .map_err(|_| Fail("a relocation target address is too large".to_string()))?;
            if memory.contains_key(&target) {
                return Err(Fail(format!(
                    "relocation target {target:06o} already contains a tape word"
                )));
            }
            memory.insert(target, origin);
            relocated_words = relocated_words.saturating_add(1);
        }
    }

    let mut binary = Binary::default();
    binary.set_entry_point(entry);
    let mut current: Option<BinaryChunk> = None;
    let mut previous_address: Option<u32> = None;
    for (address, origin) in memory {
        let numeric_address = u32::from(address);
        let contiguous = previous_address
            .and_then(|previous| previous.checked_add(1))
            .is_some_and(|expected| expected == numeric_address);
        if !contiguous && let Some(chunk) = current.take() {
            binary.add_chunk(chunk);
        }
        current
            .get_or_insert_with(|| BinaryChunk {
                address,
                words: Vec::new(),
            })
            .push(origin.word);
        previous_address = Some(numeric_address);
    }
    if let Some(chunk) = current {
        binary.add_chunk(chunk);
    }

    Ok(MergeResult {
        binary,
        identical_overlaps,
        overwrites,
        relocated_words,
    })
}

fn read_input(path: &Path) -> Result<TapeImage, Fail> {
    let file = OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|error| Fail(format!("failed to open {}: {error}", path.display())))?;
    read_tape(&mut BufReader::new(file))
        .map_err(|error| Fail(format!("failed to read {}: {error}", path.display())))
}

fn run() -> Result<(), Fail> {
    let cli = Cli::parse();
    let entry = parse_octal_address(&cli.entry)?;
    let allowed_overwrites = cli
        .allow_overwrite
        .iter()
        .map(|value| parse_octal_address(value))
        .collect::<Result<BTreeSet<_>, _>>()?;
    let relocations = cli
        .relocate_input_range
        .iter()
        .map(|value| parse_relocation(value))
        .collect::<Result<Vec<_>, _>>()?;
    let input_paths: Vec<PathBuf> = cli.inputs.iter().map(PathBuf::from).collect();
    let tapes = input_paths
        .iter()
        .map(|path| read_input(path))
        .collect::<Result<Vec<_>, _>>()?;
    let result = merge_images(&tapes, entry, &allowed_overwrites, &relocations)?;

    let output_path = PathBuf::from(cli.output);
    let output_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&output_path)
        .map_err(|error| {
            Fail(format!(
                "failed to write {}: {error}",
                output_path.display()
            ))
        })?;
    let mut writer = BufWriter::new(output_file);
    write_user_program(&result.binary, &mut writer, &output_path)
        .map_err(|error| Fail(error.to_string()))?;

    println!(
        "Merged {} tapes into {} words in {} blocks.",
        tapes.len(),
        result
            .binary
            .chunks()
            .iter()
            .map(|chunk| chunk.words.len())
            .sum::<usize>(),
        result.binary.chunks().len()
    );
    println!("Entry point: {entry:06o}.");
    println!("Identical overlaps: {}.", result.identical_overlaps);
    println!("Relocated words: {}.", result.relocated_words);
    for overwrite in &result.overwrites {
        println!(
            "Allowed overwrite at {:06o}: input {} {:012o} -> input {} {:012o}.",
            overwrite.address,
            overwrite.old_input_index + 1,
            overwrite.old_word,
            overwrite.new_input_index + 1,
            overwrite.new_word
        );
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use assembler::{TapeBlock, TapeImage};
    use base::prelude::{Address, u18, u36};

    use super::{Relocation, merge_images, parse_octal_address, parse_relocation};

    fn tape(program: TapeBlock) -> TapeImage {
        TapeImage {
            blocks: vec![
                TapeBlock {
                    address: Address::from(u18!(0o27)),
                    words: vec![u36!(1), u36!(2)],
                },
                program,
            ],
            final_next: Address::from(u18!(0o27)),
        }
    }

    #[test]
    fn rejects_an_unapproved_conflict() {
        let tapes = vec![
            tape(TapeBlock {
                address: Address::from(u18!(0o100)),
                words: vec![u36!(1)],
            }),
            tape(TapeBlock {
                address: Address::from(u18!(0o100)),
                words: vec![u36!(2)],
            }),
        ];

        let error = merge_images(&tapes, Address::from(u18!(0o200)), &BTreeSet::new(), &[])
            .expect_err("the conflict needs explicit permission");

        assert!(error.to_string().contains("--allow-overwrite 000100"));
    }

    #[test]
    fn applies_an_approved_overwrite_in_input_order() {
        let tapes = vec![
            tape(TapeBlock {
                address: Address::from(u18!(0o100)),
                words: vec![u36!(1)],
            }),
            tape(TapeBlock {
                address: Address::from(u18!(0o100)),
                words: vec![u36!(2)],
            }),
        ];
        let allowed = BTreeSet::from([Address::from(u18!(0o100))]);

        let result = merge_images(&tapes, Address::from(u18!(0o200)), &allowed, &[])
            .expect("the approved merge should succeed");

        assert_eq!(result.binary.chunks()[0].words, vec![u36!(2)]);
        assert_eq!(result.overwrites.len(), 1);
        assert_eq!(result.overwrites[0].new_input_index, 1);
    }

    #[test]
    fn parses_octal_addresses() {
        assert_eq!(
            parse_octal_address("200140").expect("the address is valid"),
            Address::from(u18!(0o200_140))
        );
        assert!(parse_octal_address("8").is_err());
    }

    #[test]
    fn relocates_an_inclusive_range_and_fills_sparse_words_with_zero() {
        let tapes = vec![tape(TapeBlock {
            address: Address::from(u18!(0o100)),
            words: vec![u36!(1), u36!(2)],
        })];
        let relocation = Relocation {
            input_index: 0,
            source_start: Address::from(u18!(0o100)),
            source_end: Address::from(u18!(0o102)),
            target_start: Address::from(u18!(0o200)),
        };

        let result = merge_images(
            &tapes,
            Address::from(u18!(0o300)),
            &BTreeSet::new(),
            &[relocation],
        )
        .expect("the relocation should succeed");

        let relocated = result
            .binary
            .chunks()
            .iter()
            .find(|chunk| chunk.address == Address::from(u18!(0o200)))
            .expect("the relocated chunk should exist");
        assert_eq!(relocated.words, vec![u36!(1), u36!(2), u36!(0)]);
        assert_eq!(result.relocated_words, 3);
    }

    #[test]
    fn rejects_a_relocation_over_an_existing_word() {
        let tapes = vec![tape(TapeBlock {
            address: Address::from(u18!(0o100)),
            words: vec![u36!(1)],
        })];
        let relocation = Relocation {
            input_index: 0,
            source_start: Address::from(u18!(0o100)),
            source_end: Address::from(u18!(0o100)),
            target_start: Address::from(u18!(0o100)),
        };

        let error = merge_images(
            &tapes,
            Address::from(u18!(0o300)),
            &BTreeSet::new(),
            &[relocation],
        )
        .expect_err("the relocation must not hide an existing word");

        assert!(error.to_string().contains("already contains a tape word"));
    }

    #[test]
    fn parses_relocation_ranges() {
        assert_eq!(
            parse_relocation("4:22000:22605:32000").expect("the relocation is valid"),
            Relocation {
                input_index: 3,
                source_start: Address::from(u18!(0o22_000)),
                source_end: Address::from(u18!(0o22_605)),
                target_start: Address::from(u18!(0o32_000)),
            }
        );
        assert!(parse_relocation("22000:32000").is_err());
        assert!(parse_relocation("4:22605:22000:32000").is_err());
        assert!(parse_relocation("0:22000:22605:32000").is_err());
    }
}
