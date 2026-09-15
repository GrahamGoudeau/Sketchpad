//! TX-2 interval timer, unit 54.
//!
//! The TX-2 Users Handbook describes a programmable 18-bit count.  At the
//! selected oscillator rate, the device produces one pulse after each count
//! interval.  Mode 30300 starts the counter and routes each pulse to flag 54.

use std::time::Duration;

use base::prelude::*;

use super::super::context::Context;
use super::super::diagnostics::CurrentInstructionDiagnostics;
use super::super::event::{InputEvent, InputEventError, OutputEvent};
use super::super::io::{FlagChange, InputFlagRaised, TransferFailed, Unit, UnitStatus};
use super::super::types::{MaskedWord, TransferMode};

const OSCILLATOR_HZ: u64 = 1_000_000;
const LATER: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub(crate) struct IntervalTimer {
    mode: Unsigned12Bit,
    count: u32,
    running: bool,
    raise_flag: bool,
    next_pulse: Option<Duration>,
}

impl IntervalTimer {
    pub(crate) fn new() -> Self {
        Self {
            mode: Unsigned12Bit::ZERO,
            count: 0,
            running: false,
            raise_flag: false,
            next_pulse: None,
        }
    }

    fn interval(&self) -> Option<Duration> {
        (self.count != 0)
            .then(|| Duration::from_nanos(u64::from(self.count) * 1_000_000_000 / OSCILLATOR_HZ))
    }

    fn start(&mut self, now: Duration) {
        self.running = true;
        self.next_pulse = self.interval().map(|interval| now + interval);
    }

    fn stop(&mut self) {
        self.running = false;
        self.next_pulse = None;
    }

    fn advance_after_pulse(&mut self, now: Duration) {
        let Some(interval) = self.interval() else {
            self.next_pulse = None;
            return;
        };
        let mut next = self.next_pulse.unwrap_or(now) + interval;
        while next <= now {
            next += interval;
        }
        self.next_pulse = Some(next);
    }
}

impl Unit for IntervalTimer {
    fn poll(&mut self, ctx: &Context) -> UnitStatus {
        let pulse_due = self
            .next_pulse
            .is_some_and(|pulse| pulse <= ctx.simulated_time);
        if pulse_due {
            self.advance_after_pulse(ctx.simulated_time);
        }
        UnitStatus {
            special: Unsigned12Bit::ZERO,
            change_flag: (pulse_due && self.raise_flag)
                .then_some(FlagChange::Raise("interval elapsed")),
            buffer_available_to_cpu: true,
            inability: false,
            missed_data: false,
            mode: self.mode,
            poll_after: self.next_pulse.unwrap_or(ctx.simulated_time + LATER),
            is_input_unit: false,
        }
    }

    fn text_info(&self, _ctx: &Context) -> String {
        let state = if self.running { "Running" } else { "Stopped" };
        format!("{state}. Interval count: {}.", self.count)
    }

    fn connect(&mut self, ctx: &Context, mode: Unsigned12Bit) {
        self.mode = mode;
        self.raise_flag = mode & 0o200 != 0;
        if mode & 0o100 != 0 {
            self.start(ctx.simulated_time);
        } else if mode & 0o200 == 0 {
            self.stop();
        }
    }

    fn disconnect(&mut self, _ctx: &Context) {
        self.raise_flag = false;
    }

    fn transfer_mode(&self) -> TransferMode {
        TransferMode::Exchange
    }

    fn read(
        &mut self,
        _ctx: &Context,
        diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<MaskedWord, TransferFailed> {
        unreachable!("attempted to read from the interval timer while executing {diagnostics}")
    }

    fn write(
        &mut self,
        ctx: &Context,
        source: Unsigned36Bit,
        _diagnostics: &CurrentInstructionDiagnostics,
    ) -> Result<Option<OutputEvent>, TransferFailed> {
        self.count = u32::from(right_half(source));
        if self.running {
            self.next_pulse = self
                .interval()
                .map(|interval| ctx.simulated_time + interval);
        }
        Ok(None)
    }

    fn name(&self) -> String {
        "Interval timer".to_string()
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

    fn context(millis: u64) -> Context {
        let when = Duration::from_millis(millis);
        Context::new(when, when)
    }

    fn diagnostics() -> CurrentInstructionDiagnostics {
        CurrentInstructionDiagnostics {
            current_instruction: Instruction::invalid(),
            instruction_address: Address::ZERO,
        }
    }

    #[test]
    fn mode_30300_raises_a_flag_after_each_interval() {
        let mut timer = IntervalTimer::new();
        timer.connect(&context(0), Unsigned12Bit::try_from(0o300).unwrap());
        timer
            .write(
                &context(0),
                Unsigned36Bit::try_from(10_000_u64).unwrap(),
                &diagnostics(),
            )
            .unwrap();
        timer.connect(&context(0), Unsigned12Bit::try_from(0o300).unwrap());

        assert_eq!(timer.poll(&context(9)).change_flag, None);
        assert!(matches!(
            timer.poll(&context(10)).change_flag,
            Some(FlagChange::Raise("interval elapsed"))
        ));
        assert!(matches!(
            timer.poll(&context(20)).change_flag,
            Some(FlagChange::Raise("interval elapsed"))
        ));
    }

    #[test]
    fn stop_mode_stops_the_counter() {
        let mut timer = IntervalTimer::new();
        timer.count = 10_000;
        timer.connect(&context(0), Unsigned12Bit::try_from(0o300).unwrap());
        timer.connect(&context(1), Unsigned12Bit::ZERO);
        assert!(!timer.running);
        assert_eq!(timer.next_pulse, None);
    }
}
