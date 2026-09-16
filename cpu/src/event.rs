//! Input and output events.
use std::error::Error;
use std::fmt::{self, Display, Formatter};

use base::Unsigned6Bit;
use base::charset::DescribedChar;

use super::alarm::Alarm;

/// The origin selected for the TX-2 oscilloscope display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScopeOrigin {
    Center,
    BottomCenter,
    LeftCenter,
    LowerLeft,
}

impl ScopeOrigin {
    fn moves_horizontal_origin(self) -> bool {
        matches!(self, Self::LeftCenter | Self::LowerLeft)
    }

    fn moves_vertical_origin(self) -> bool {
        matches!(self, Self::BottomCenter | Self::LowerLeft)
    }
}

/// An input event.
#[derive(Debug)]
pub enum InputEvent {
    PetrMountPaperTape { data: Vec<u8> },
    LwKeyboardInput { data: Vec<Unsigned6Bit> },
    LightPenDetected,
}

/// A failed input event.
#[derive(Debug)]
pub enum InputEventError {
    /// `BufferUnavailable` means that an input event has occurred on
    /// a device whose buffer is still being used by the CPU.
    /// Sometimes this can happen if the program running on the TX-2
    /// makes use of the hold bit too much in some sequence, with the
    /// result that the sequence that should be reading the device
    /// (and hence freeing the buffer) isn't getting a chance to do
    /// this.
    BufferUnavailable,

    /// `InputOnUnattachedUnit` means that the user has generated
    /// input on a unit which has not been attached.  That is, the
    /// simulator does not believe that this hardware exists in the
    /// system at all.  This would likely be due to some configuration
    /// inconsistency between the user interface and the simulator
    /// core.
    InputOnUnattachedUnit,

    InputEventNotValidForDevice,
    InvalidReentrantCall,

    Alarm(Alarm),
}

impl Display for InputEventError {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result<(), fmt::Error> {
        match self {
            InputEventError::BufferUnavailable => f.write_str("buffer unavailable"),
            InputEventError::InputOnUnattachedUnit => {
                f.write_str("input on a unit which is not attached")
            }
            InputEventError::InputEventNotValidForDevice => {
                f.write_str("input event is not valid for this device")
            }
            InputEventError::InvalidReentrantCall => f.write_str("inalid re-entrant call"),
            InputEventError::Alarm(alarm) => alarm.fmt(f),
        }
    }
}

impl Error for InputEventError {}

/// An output event.
#[derive(Debug, PartialEq, Eq)]
pub enum OutputEvent {
    /// A code has arrived at a Lincoln Writer.
    LincolnWriterPrint {
        unit: Unsigned6Bit,
        ch: DescribedChar,
    },

    /// One point has arrived at the oscilloscope display.
    ScopePoint {
        unit: Unsigned6Bit,
        raw_x: u16,
        raw_y: u16,
        x: i16,
        y: i16,
        intensity: u8,
        origin: ScopeOrigin,
    },
}

impl OutputEvent {
    /// Return the illuminated position on the physical 1023-by-1023 scope face.
    ///
    /// Unit 60 moves an origin by complementing the applicable coordinate sign
    /// bit.  The raw coordinate is required because signed decoding makes both
    /// one's-complement zero encodings equal and loses that hardware state.
    #[must_use]
    pub fn scope_physical_position(&self) -> Option<(u16, u16)> {
        let Self::ScopePoint {
            raw_x,
            raw_y,
            origin,
            ..
        } = self
        else {
            return None;
        };
        Some((
            scope_axis_position(*raw_x, origin.moves_horizontal_origin()),
            scope_axis_position(*raw_y, origin.moves_vertical_origin()),
        ))
    }
}

fn scope_axis_position(raw: u16, moved_origin: bool) -> u16 {
    debug_assert!(raw <= 0o1777);
    if moved_origin {
        if raw & 0o1000 == 0 { raw } else { raw - 1 }
    } else if raw & 0o1000 == 0 {
        raw + 0o777
    } else {
        raw - 0o1000
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base::u6;

    fn point(raw_x: u16, raw_y: u16, origin: ScopeOrigin) -> OutputEvent {
        OutputEvent::ScopePoint {
            unit: u6!(0o60),
            raw_x,
            raw_y,
            x: 0,
            y: 0,
            intensity: 0,
            origin,
        }
    }

    #[test]
    fn centered_origin_preserves_both_zero_encodings_at_center() {
        assert_eq!(
            point(0, 0o1777, ScopeOrigin::Center).scope_physical_position(),
            Some((511, 511)),
        );
        assert_eq!(
            point(0o1000, 0o777, ScopeOrigin::Center).scope_physical_position(),
            Some((0, 1022)),
        );
    }

    #[test]
    fn moved_origin_complements_the_sign_bit_without_collapsing_an_axis() {
        assert_eq!(
            point(0, 0, ScopeOrigin::LowerLeft).scope_physical_position(),
            Some((0, 0)),
        );
        assert_eq!(
            point(0o777, 0o777, ScopeOrigin::LowerLeft).scope_physical_position(),
            Some((511, 511)),
        );
        assert_eq!(
            point(0o1000, 0o1000, ScopeOrigin::LowerLeft).scope_physical_position(),
            Some((511, 511)),
        );
        assert_eq!(
            point(0o1777, 0o1777, ScopeOrigin::LowerLeft).scope_physical_position(),
            Some((1022, 1022)),
        );
    }
}
