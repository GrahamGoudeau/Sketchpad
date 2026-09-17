//! TX-2 light pen, unit 55.

use std::time::Duration;

use base::prelude::*;

use super::super::context::Context;
use super::super::diagnostics::CurrentInstructionDiagnostics;
use super::super::event::{InputEvent, InputEventError, OutputEvent};
use super::super::io::{FlagChange, InputFlagRaised, TransferFailed, Unit, UnitStatus};
use super::super::types::{MaskedWord, TransferMode};

const LATER: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub(crate) struct LightPen {
    connected: bool,
    detection_pending: bool,
    mode: Unsigned12Bit,
}

impl LightPen {
    pub(crate) fn new() -> Self {
        Self {
            connected: false,
            detection_pending: false,
            mode: Unsigned12Bit::ZERO,
        }
    }
}

impl Unit for LightPen {
    fn poll(&mut self, ctx: &Context) -> UnitStatus {
        let raise_flag = self.connected && self.detection_pending;
        self.detection_pending = false;
        UnitStatus {
            special: Unsigned12Bit::ZERO,
            change_flag: raise_flag.then_some(FlagChange::Raise("light detected")),
            buffer_available_to_cpu: false,
            inability: false,
            missed_data: false,
            mode: self.mode,
            poll_after: ctx.simulated_time + LATER,
            is_input_unit: true,
        }
    }

    fn text_info(&self, _ctx: &Context) -> String {
        if self.connected {
            "Ready.".to_string()
        } else {
            "Disconnected.".to_string()
        }
    }

    fn connect(&mut self, _ctx: &Context, mode: Unsigned12Bit) {
        self.connected = true;
        self.mode = mode;
    }

    fn disconnect(&mut self, _ctx: &Context) {
        self.connected = false;
        self.detection_pending = false;
    }

    fn transfer_mode(&self) -> TransferMode {
        TransferMode::Exchange
    }

    fn read(
        &mut self,
        _ctx: &Context,
        diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<MaskedWord, TransferFailed> {
        unreachable!("attempted to read from the light pen while executing {diagnostics}")
    }

    fn write(
        &mut self,
        _ctx: &Context,
        _source: Unsigned36Bit,
        diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<Option<OutputEvent>, TransferFailed> {
        unreachable!("attempted to write to the light pen while executing {diagnostics}")
    }

    fn name(&self) -> String {
        "Light pen".to_string()
    }

    fn on_input_event(
        &mut self,
        _ctx: &Context,
        event: InputEvent,
    ) -> Result<InputFlagRaised, InputEventError> {
        match event {
            InputEvent::LightPenDetected if self.connected => {
                self.detection_pending = true;
                Ok(InputFlagRaised::Yes)
            }
            InputEvent::LightPenDetected => Ok(InputFlagRaised::No),
            _ => Err(InputEventError::InputEventNotValidForDevice),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> Context {
        Context::new(Duration::ZERO, Duration::ZERO)
    }

    #[test]
    fn raises_one_flag_after_a_connected_detection() {
        let ctx = context();
        let mut pen = LightPen::new();
        assert!(matches!(
            pen.on_input_event(&ctx, InputEvent::LightPenDetected),
            Ok(InputFlagRaised::No)
        ));
        pen.connect(&ctx, Unsigned12Bit::ZERO);
        assert!(matches!(
            pen.on_input_event(&ctx, InputEvent::LightPenDetected),
            Ok(InputFlagRaised::Yes)
        ));
        assert!(matches!(
            pen.poll(&ctx).change_flag,
            Some(FlagChange::Raise("light detected"))
        ));
        assert_eq!(pen.poll(&ctx).change_flag, None);
    }

    #[test]
    fn disconnect_cancels_a_pending_detection() {
        let ctx = context();
        let mut pen = LightPen::new();
        pen.connect(&ctx, Unsigned12Bit::ZERO);
        pen.on_input_event(&ctx, InputEvent::LightPenDetected)
            .expect("the connected light pen should accept a detection");
        pen.disconnect(&ctx);
        assert_eq!(pen.poll(&ctx).change_flag, None);
    }
}
