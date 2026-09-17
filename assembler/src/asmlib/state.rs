//! Represents the state of the source code parser.
//!
//! State information is:
//!
//! - Current numeric base (octal or decimal)
//! - Currently-known macro definitions
use std::collections::BTreeMap;

use chumsky::{inspector::Inspector, prelude::Input};

use super::manuscript::MacroDefinition;
use super::symbol::SymbolName;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum NumeralMode {
    #[default]
    Octal,
    Decimal,
}

impl NumeralMode {
    pub(crate) fn radix(self, alternate: bool) -> u32 {
        match (&self, alternate) {
            (&NumeralMode::Octal, false) | (&NumeralMode::Decimal, true) => 8,
            (&NumeralMode::Decimal, false) | (&NumeralMode::Octal, true) => 10,
        }
    }

    pub(crate) fn set_numeral_mode(&mut self, mode: NumeralMode) {
        *self = mode;
    }
}

#[test]
fn test_numeral_mode_default() {
    assert_eq!(NumeralMode::default(), NumeralMode::Octal);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct TruncatableMap<K: Eq, V: Eq> {
    history: Vec<(K, Option<V>)>,
    items: BTreeMap<K, V>,
}

impl<K: Eq, V: Eq> Default for TruncatableMap<K, V> {
    fn default() -> Self {
        TruncatableMap {
            history: Default::default(),
            items: BTreeMap::new(),
        }
    }
}

impl<K, V> TruncatableMap<K, V>
where
    K: Clone + Eq + Ord,
    V: Eq,
{
    pub(crate) fn insert(&mut self, k: K, v: V) {
        let previous = self.items.insert(k.clone(), v);
        self.history.push((k, previous));
    }

    pub(crate) fn get(&self, k: &K) -> Option<&V> {
        self.items.get(k)
    }

    pub(crate) fn len(&self) -> usize {
        self.history.len()
    }

    pub(crate) fn truncate(&mut self, newlen: usize) {
        let discarded: Vec<(K, Option<V>)> = self.history.drain(newlen..).collect();
        for (k, previous) in discarded.into_iter().rev() {
            match previous {
                Some(value) => {
                    self.items.insert(k, value);
                }
                None => {
                    self.items.remove(&k);
                }
            }
        }
    }

    pub(crate) fn map_ref(&self) -> &BTreeMap<K, V> {
        &self.items
    }
}

#[test]
fn truncating_a_replacement_restores_the_previous_value() {
    let mut values = TruncatableMap::default();
    values.insert("A", 1);
    let checkpoint = values.len();
    values.insert("A", 2);
    values.insert("B", 3);

    values.truncate(checkpoint);

    assert_eq!(values.get(&"A"), Some(&1));
    assert_eq!(values.get(&"B"), None);
}

#[derive(Debug, PartialEq, Eq, Clone)]
pub(crate) struct State<'src> {
    pub(super) numeral_mode: NumeralMode,
    pub(super) body: &'src str,
    pub(super) macros: TruncatableMap<SymbolName, MacroDefinition>,
}

impl<'src> State<'src> {
    pub(crate) fn new(body: &'src str, numeral_mode: NumeralMode) -> State<'src> {
        State {
            numeral_mode,
            body,
            macros: Default::default(),
        }
    }

    pub(crate) fn define_macro(&mut self, definition: MacroDefinition) {
        // Section 6-1.3 of the Users Handbook explicitly permits a
        // macro instruction to be redefined.
        self.macros.insert(definition.name.clone(), definition);
    }

    pub(crate) fn get_macro_definition(&self, name: &SymbolName) -> Option<&MacroDefinition> {
        self.macros.get(name)
    }

    pub(crate) fn macros(&self) -> &BTreeMap<SymbolName, MacroDefinition> {
        self.macros.map_ref()
    }
}

impl<'src, I: Input<'src>> Inspector<'src, I> for State<'src> {
    type Checkpoint = usize;

    #[inline(always)]
    fn on_token(&mut self, _: &<I as Input<'src>>::Token) {}

    fn on_save<'parse>(
        &self,
        _cursor: &chumsky::input::Cursor<'src, 'parse, I>,
    ) -> Self::Checkpoint {
        self.macros.len()
    }

    fn on_rewind<'parse>(
        &mut self,
        marker: &chumsky::input::Checkpoint<'src, 'parse, I, Self::Checkpoint>,
    ) {
        self.macros.truncate(*marker.inspector());
    }
}
