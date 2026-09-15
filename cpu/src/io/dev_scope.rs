//! TX-2 oscilloscope display, unit 60.

use std::time::Duration;

use base::prelude::*;
use tracing::{Level, event};

use super::super::context::Context;
use super::super::diagnostics::CurrentInstructionDiagnostics;
use super::super::event::{InputEvent, InputEventError, OutputEvent, ScopeOrigin};
use super::super::io::{FlagChange, InputFlagRaised, TransferFailed, Unit, UnitStatus};
use super::super::types::{MaskedWord, TransferMode};

const UNIT: Unsigned6Bit = u6!(0o60);
const LATER: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub(crate) struct ScopeDisplay {
    mode: Unsigned12Bit,
    connected: bool,
    transmit_will_be_finished_at: Option<Duration>,
}

impl ScopeDisplay {
    pub(crate) fn new() -> Self {
        Self {
            mode: Unsigned12Bit::ZERO,
            connected: false,
            transmit_will_be_finished_at: None,
        }
    }

    fn is_transmitting(&self, ctx: &Context) -> bool {
        self.transmit_will_be_finished_at
            .is_some_and(|done_at| done_at > ctx.simulated_time)
    }

    fn intensity(&self) -> u8 {
        ((u16::from(self.mode) >> 3) & 0o3) as u8
    }

    fn origin(&self) -> ScopeOrigin {
        match (u16::from(self.mode) >> 6) & 0o3 {
            0 => ScopeOrigin::Center,
            1 => ScopeOrigin::BottomCenter,
            2 => ScopeOrigin::LeftCenter,
            3 => ScopeOrigin::LowerLeft,
            _ => unreachable!(),
        }
    }

    fn spot_duration(&self) -> Duration {
        Duration::from_micros(10_u64 << self.intensity())
    }

    fn decode_coordinate(raw: u16) -> i16 {
        debug_assert!(raw <= 0o1777);
        if raw & 0o1000 == 0 {
            raw as i16
        } else {
            -(((!raw) & 0o1777) as i16)
        }
    }

    fn decode_point(source: Unsigned36Bit) -> (i16, i16) {
        let bits = u64::from(source);
        let x = ((bits >> 26) & 0o1777) as u16;
        let y = ((bits >> 8) & 0o1777) as u16;
        (Self::decode_coordinate(x), Self::decode_coordinate(y))
    }
}

impl Unit for ScopeDisplay {
    fn poll(&mut self, ctx: &Context) -> UnitStatus {
        let transmitting = self.is_transmitting(ctx);
        let poll_after = if transmitting {
            self.transmit_will_be_finished_at
                .expect("a transmitting scope must have a completion time")
        } else {
            ctx.simulated_time + LATER
        };
        let change_flag = if self.connected && !transmitting {
            Some(FlagChange::Raise("scope buffer is available"))
        } else {
            None
        };
        UnitStatus {
            special: Unsigned12Bit::ZERO,
            change_flag,
            buffer_available_to_cpu: !transmitting,
            inability: false,
            missed_data: false,
            mode: self.mode,
            poll_after,
            is_input_unit: false,
        }
    }

    fn text_info(&self, ctx: &Context) -> String {
        if self.is_transmitting(ctx) {
            "Displaying a point.".to_string()
        } else {
            "Ready.".to_string()
        }
    }

    fn connect(&mut self, _ctx: &Context, mode: Unsigned12Bit) {
        event!(Level::INFO, "{} connected in mode {mode:04o}", self.name());
        self.connected = true;
        self.mode = mode;
    }

    fn disconnect(&mut self, _ctx: &Context) {
        self.connected = false;
    }

    fn transfer_mode(&self) -> TransferMode {
        TransferMode::Exchange
    }

    fn read(
        &mut self,
        _ctx: &Context,
        diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<MaskedWord, TransferFailed> {
        unreachable!("attempted to read from the scope display while executing {diagnostics}")
    }

    fn write(
        &mut self,
        ctx: &Context,
        source: Unsigned36Bit,
        _diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<Option<OutputEvent>, TransferFailed> {
        if self.is_transmitting(ctx) {
            return Err(TransferFailed::BufferNotFree);
        }
        self.transmit_will_be_finished_at = Some(ctx.simulated_time + self.spot_duration());
        let (x, y) = Self::decode_point(source);
        Ok(Some(OutputEvent::ScopePoint {
            unit: UNIT,
            x,
            y,
            intensity: self.intensity(),
            origin: self.origin(),
        }))
    }

    fn name(&self) -> String {
        "Oscilloscope display".to_string()
    }

    fn on_input_event(
        &mut self,
        _ctx: &Context,
        _event: InputEvent,
    ) -> Result<InputFlagRaised, InputEventError> {
        Err(InputEventError::InputEventNotValidForDevice)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn context(micros: u64) -> Context {
        let when = Duration::from_micros(micros);
        Context::new(when, when)
    }

    fn diagnostics() -> CurrentInstructionDiagnostics {
        CurrentInstructionDiagnostics {
            current_instruction: Instruction::invalid(),
            instruction_address: Address::ZERO,
        }
    }

    #[test]
    fn decodes_signed_ones_complement_coordinates() {
        assert_eq!(ScopeDisplay::decode_coordinate(0), 0);
        assert_eq!(ScopeDisplay::decode_coordinate(0o777), 511);
        assert_eq!(ScopeDisplay::decode_coordinate(0o1000), -511);
        assert_eq!(ScopeDisplay::decode_coordinate(0o1776), -1);
        assert_eq!(ScopeDisplay::decode_coordinate(0o1777), 0);

        let x = 0o1776_u64;
        let y = 0o123_u64;
        let source = Unsigned36Bit::try_from((x << 26) | (y << 8)).unwrap();
        assert_eq!(ScopeDisplay::decode_point(source), (-1, 0o123));
    }

    #[test]
    fn reports_mode_and_point() {
        let mut scope = ScopeDisplay::new();
        scope.connect(&context(0), Unsigned12Bit::try_from(0o230).unwrap());
        assert_eq!(scope.intensity(), 3);
        assert_eq!(scope.origin(), ScopeOrigin::LeftCenter);
        assert_eq!(scope.spot_duration(), Duration::from_micros(80));

        let source = Unsigned36Bit::try_from((2_u64 << 26) | (2_u64 << 8)).unwrap();
        let event = scope
            .write(&context(0), source, &diagnostics())
            .expect("the scope must accept its first point");
        assert_eq!(
            event,
            Some(OutputEvent::ScopePoint {
                unit: UNIT,
                x: 2,
                y: 2,
                intensity: 3,
                origin: ScopeOrigin::LeftCenter,
            })
        );
    }

    #[test]
    fn keeps_buffer_busy_for_spot_duration() {
        let mut scope = ScopeDisplay::new();
        scope.connect(&context(0), Unsigned12Bit::try_from(0o010).unwrap());
        assert!(
            scope
                .write(&context(0), Unsigned36Bit::ZERO, &diagnostics())
                .is_ok()
        );
        assert!(matches!(
            scope.write(&context(19), Unsigned36Bit::ZERO, &diagnostics()),
            Err(TransferFailed::BufferNotFree)
        ));

        let busy = scope.poll(&context(19));
        assert!(!busy.buffer_available_to_cpu);
        assert_eq!(busy.change_flag, None);

        let ready = scope.poll(&context(20));
        assert!(ready.buffer_available_to_cpu);
        assert!(matches!(ready.change_flag, Some(FlagChange::Raise(_))));
    }
}
