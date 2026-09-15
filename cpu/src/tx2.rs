//! Emulation of the TX-2 computer.
//!
//! # Principles of Operation
//!
//! Calls are non-blocking and update the state of the emulated TX-2
//! where necessary.
//!
//! # Timing
//!
//! Method calls return information about how much simulated time they
//! would have taken up. The caller is responsible for snsuring that
//! method calls are paced such that the overall execution speed
//! is whatever it wants (for example 1x speed).
use std::cmp::min;
use std::collections::BTreeMap;
use std::time::Duration;

use tracing::{Level, event, span};

use wasm_bindgen::prelude::*;

use base::prelude::*;

use crate::diagnostics::CurrentInstructionDiagnostics;

use super::alarm::{Alarm, AlarmKind, Alarmer, UnmaskedAlarm};
use super::alarmunit::AlarmStatus;
use super::context::Context;
use super::control::{ConfigurationMemorySetup, ControlUnit, ResetMode, RunMode};
use super::event::{InputEvent, OutputEvent};
use super::io::{DeviceManager, ExtendedUnitState, InputFlagRaised, set_up_peripherals};
use super::memory::{MemoryConfiguration, MemoryMapped, MemoryUnit, MetaBitChange};
use super::{InputEventError, PanicOnUnmaskedAlarm};
use super::{LIGHT_PEN, PETR};

const SCOPE_AXIS_MAX: u16 = 1022;

/// The physical light pen position on the oscilloscope face.
///
/// Coordinates use the complete visible scope area.  Zero is the left or
/// lower edge.  `SCOPE_AXIS_MAX` is the right or upper edge.
#[derive(Debug, Default)]
struct LightPenPosition {
    active: bool,
    x: u16,
    y: u16,
    radius: u16,
}

impl LightPenPosition {
    fn axis_position(value: i16, moved_origin: bool) -> i32 {
        if moved_origin {
            i32::from(value) * 2
        } else {
            i32::from(value) + 511
        }
    }

    fn sees(&self, event: &OutputEvent) -> bool {
        let OutputEvent::ScopePoint { x, y, origin, .. } = event else {
            return false;
        };
        if !self.active {
            return false;
        }

        let left_origin = matches!(
            origin,
            super::event::ScopeOrigin::LeftCenter | super::event::ScopeOrigin::LowerLeft
        );
        let bottom_origin = matches!(
            origin,
            super::event::ScopeOrigin::BottomCenter | super::event::ScopeOrigin::LowerLeft
        );
        let scope_x = Self::axis_position(*x, left_origin);
        let scope_y = Self::axis_position(*y, bottom_origin);
        let dx = scope_x - i32::from(self.x);
        let dy = scope_y - i32::from(self.y);
        let radius = i32::from(self.radius);
        dx * dx + dy * dy <= radius * radius
    }
}

/// `Tx2` emulates the TX-2 computer, with peripherals.
#[wasm_bindgen]
pub struct Tx2 {
    control: ControlUnit,
    mem: MemoryUnit,
    devices: DeviceManager,
    next_execution_due: Option<Duration>,
    next_hw_poll_due: Duration,
    run_mode: RunMode,
    light_pen_position: LightPenPosition,
    light_pen_detection_count: u64,
}

impl Tx2 {
    /// Create a new instance.
    pub fn new(
        ctx: &Context,
        panic_on_unmasked_alarm: PanicOnUnmaskedAlarm,
        mem_config: &MemoryConfiguration,
    ) -> Tx2 {
        let control = ControlUnit::new(
            panic_on_unmasked_alarm,
            ConfigurationMemorySetup::Uninitialised,
        );
        event!(
            Level::DEBUG,
            "Initial control unit state iis {:?}",
            &control
        );

        let mem = MemoryUnit::new(ctx, mem_config);
        let mut devices = DeviceManager::new();
        set_up_peripherals(ctx, &mut devices);
        Tx2 {
            control,
            mem,
            devices,
            next_execution_due: None,
            next_hw_poll_due: ctx.simulated_time,
            run_mode: RunMode::InLimbo,
            light_pen_position: LightPenPosition::default(),
            light_pen_detection_count: 0,
        }
    }

    #[must_use]
    pub fn get_status_of_alarm(&self, name: &str) -> Option<AlarmStatus> {
        self.control.get_status_of_alarm(name)
    }

    #[must_use]
    pub fn get_alarm_statuses(&self) -> Vec<AlarmStatus> {
        self.control.get_alarm_statuses()
    }

    pub fn set_alarm_masked(&mut self, kind: AlarmKind, masked: bool) -> Result<(), Alarm> {
        self.control.set_alarm_masked(kind, masked)
    }

    pub fn set_run_mode(&mut self, run_mode: RunMode) {
        self.run_mode = run_mode;
    }

    /// Update the emulator's idea of when the next instruction should
    /// begin execution.
    pub fn set_next_execution_due(&mut self, now: Duration, newval: Option<Duration>) {
        if let Some(t) = newval {
            assert!(now <= t);
        }
        event!(
            Level::TRACE,
            "Changing next_execution_due from {:?} to {:?}",
            self.next_execution_due,
            newval,
        );
        self.next_execution_due = newval;
    }

    /// Update the emulator's idea of when the next hardware state
    /// change might be.
    fn set_next_hw_poll_due(&mut self, now: Duration, newval: Duration) {
        assert!(now <= newval);
        event!(
            Level::TRACE,
            "Changing next_hw_poll_due from {:?} to {:?}",
            self.next_hw_poll_due,
            newval,
        );
        self.next_hw_poll_due = newval;
    }

    /// Emulate the user pressing the CODABO key.
    pub fn codabo(&mut self, ctx: &Context, reset_mode: &ResetMode) -> Result<(), Alarm> {
        self.control
            .codabo(ctx, reset_mode, &mut self.devices, &mut self.mem)
    }

    fn on_input_event(
        &mut self,
        ctx: &Context,
        unit: Unsigned6Bit,
        event: InputEvent,
    ) -> Result<InputFlagRaised, InputEventError> {
        match self.devices.on_input_event(ctx, unit, event) {
            Ok(InputFlagRaised::Yes) => {
                // update the poll time for this unit to force it to
                // be polled
                self.devices.update_poll_time(ctx, unit);
                Ok(InputFlagRaised::Yes)
            }
            Ok(InputFlagRaised::No) => Ok(InputFlagRaised::No),
            Err(e) => Err(e),
        }
    }

    /// Emulate the effect of the user mounting a paper tape.
    pub fn mount_paper_tape(
        &mut self,
        ctx: &Context,
        data: Vec<u8>,
    ) -> Result<InputFlagRaised, InputEventError> {
        self.on_input_event(ctx, PETR, InputEvent::PetrMountPaperTape { data })
    }

    /// Emulate the light pen seeing an intensified point on scope 60.
    pub fn light_pen_detected(
        &mut self,
        ctx: &Context,
    ) -> Result<InputFlagRaised, InputEventError> {
        let raised = self.on_input_event(ctx, LIGHT_PEN, InputEvent::LightPenDetected)?;
        if raised == InputFlagRaised::Yes {
            self.light_pen_detection_count += 1;
            self.next_hw_poll_due = ctx.simulated_time;
        }
        Ok(raised)
    }

    /// Return the count of photocell detections accepted by unit 55.
    #[must_use]
    pub fn light_pen_detection_count(&self) -> u64 {
        self.light_pen_detection_count
    }

    /// Put the physical light pen on the oscilloscope face.
    ///
    /// A scope point under an active pen causes the unit 55 photocell event.
    pub fn set_light_pen_position(&mut self, x: u16, y: u16, radius: u16, active: bool) {
        self.light_pen_position = LightPenPosition {
            active,
            x: x.min(SCOPE_AXIS_MAX),
            y: y.min(SCOPE_AXIS_MAX),
            radius: radius.min(SCOPE_AXIS_MAX),
        };
    }

    fn detect_light_pen_illumination(&mut self, ctx: &Context, output: &OutputEvent) {
        if !self.light_pen_position.sees(output) {
            return;
        }
        if let Err(error) = self.light_pen_detected(ctx) {
            event!(
                Level::ERROR,
                "light-pen photocell event failed at simulated time {:?}: {}",
                ctx.simulated_time,
                error
            );
        }
    }

    /// Set the four nine-bit shaft encoders and their pushbutton metabit.
    pub fn set_knob_register(&mut self, quarters: [Unsigned9Bit; 4], meta: bool) {
        let left = join_quarters(quarters[0], quarters[1]);
        let right = join_quarters(quarters[2], quarters[3]);
        self.mem.set_knob_register(join_halves(left, right), meta);
    }

    /// Set the 36 external pushbuttons and their metabit pushbutton.
    pub fn set_external_input_register(&mut self, quarters: [Unsigned9Bit; 4], meta: bool) {
        let left = join_quarters(quarters[0], quarters[1]);
        let right = join_quarters(quarters[2], quarters[3]);
        self.mem
            .set_external_input_register(join_halves(left, right), meta);
    }

    /// Inspect one memory word without changing the emulated machine state.
    pub fn inspect_memory_word(
        &mut self,
        ctx: &Context,
        address: Unsigned18Bit,
    ) -> Result<(u64, bool), String> {
        self.mem
            .fetch(ctx, &Address::from(address), &MetaBitChange::None)
            .map(|(word, extra)| (word.into(), extra.meta))
            .map_err(|error| error.to_string())
    }

    /// Inspect the current control state without changing the emulated machine.
    pub fn inspect_control_state(&self) -> (Option<u8>, u32, u32, String) {
        let registers = self.control.inspect_registers();
        let diagnostics = self.control.diagnostics();
        (
            registers.k.map(Into::into),
            Unsigned18Bit::from(registers.p).into(),
            Unsigned18Bit::from(diagnostics.instruction_address).into(),
            registers.n_sym.as_ref().map_or_else(
                || format!("{:012o}", registers.n.bits()),
                ToString::to_string,
            ),
        )
    }

    /// Inspect the current F-memory address and resolved configuration.
    #[must_use]
    pub fn inspect_current_configuration(&self) -> (u8, u16) {
        self.control.inspect_current_configuration()
    }

    /// Inspect one index register without changing the emulated machine.
    #[must_use]
    pub fn inspect_index_register(&self, register: Unsigned6Bit) -> i32 {
        let registers = self.control.inspect_registers();
        registers.index_regs[usize::from(register)].into()
    }

    /// Inspect one sequence flag without changing the emulated machine.
    #[must_use]
    pub fn inspect_sequence_flag(&self, sequence: Unsigned6Bit) -> bool {
        self.control.current_flag_state(&sequence)
    }

    /// Emulate the effect of the user pressing a key on one of the
    /// Lincoln Writers.
    pub fn lw_input(
        &mut self,
        ctx: &Context,
        unit: Unsigned6Bit,
        codes: &[Unsigned6Bit],
    ) -> Result<(bool, InputFlagRaised), String> {
        let event = InputEvent::LwKeyboardInput {
            data: codes.to_vec(),
        };
        match self.on_input_event(ctx, unit, event) {
            Ok(flag_raise) => {
                if flag_raise == InputFlagRaised::Yes {
                    // We should expect to poll the hardware in the
                    // next call to tick().
                    self.next_hw_poll_due = ctx.simulated_time;
                }
                Ok((true, flag_raise))
            }
            Err(InputEventError::BufferUnavailable) => Ok((false, InputFlagRaised::No)),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Return the time at which the emulator would like to next be
    /// called.
    #[must_use]
    pub fn next_tick(&self) -> Duration {
        match (
            self.run_mode,
            self.next_hw_poll_due,
            self.next_execution_due,
        ) {
            (RunMode::InLimbo, hw, _) | (RunMode::Running, hw, None) => hw,
            (RunMode::Running, hw, Some(insn)) => min(hw, insn),
        }
    }

    fn poll_hw(&mut self, ctx: &Context) -> Result<(), Alarm> {
        // check for I/O alarms, flag changes.
        let now = &ctx.simulated_time;
        event!(Level::TRACE, "polling hardware for updates (now={:?})", now);
        match self
            .control
            .poll_hardware(ctx, &mut self.devices, self.run_mode)
        {
            Ok((mode, next)) => {
                if self.run_mode != mode {
                    event!(
                        Level::DEBUG,
                        "poll_hardware updating run_mode to ({mode:?})"
                    );
                }
                self.run_mode = mode;

                self.set_next_hw_poll_due(
                    *now,
                    match next {
                        Some(when) => when,
                        None => {
                            // TODO: check why poll() doesn't always
                            // return a next-poll time.
                            *now + Duration::from_micros(5)
                        }
                    },
                );
                Ok(())
            }
            Err(alarm) => {
                event!(
                    Level::INFO,
                    "Alarm raised during hardware polling at system time {:?}",
                    now
                );
                let diags: CurrentInstructionDiagnostics = self.control.diagnostics().clone();
                self.control.fire_if_not_masked(alarm, diags)
            }
        }
    }

    fn execute_one_instruction(
        &mut self,
        ctx: &Context,
    ) -> Result<(u64, Option<OutputEvent>), UnmaskedAlarm> {
        let now = &ctx.simulated_time;
        if self.run_mode == RunMode::InLimbo {
            event!(
                Level::WARN,
                "execute_one_instruction was called while machine is in LIMBO"
            );
            self.set_next_execution_due(*now, None);
            return Ok((0, None));
        }

        let mut hardware_state_changed: Option<SequenceNumber> = None;
        match self.control.execute_instruction(
            ctx,
            &mut self.devices,
            &mut self.mem,
            &mut hardware_state_changed,
        ) {
            Err((alarm, address)) => {
                event!(
                    Level::INFO,
                    "Alarm raised during instruction execution at {:o} at system time {:?}",
                    address,
                    &ctx.simulated_time
                );
                self.set_next_execution_due(*now, None);
                assert!(self.unmasked_alarm_active());
                Err(UnmaskedAlarm {
                    alarm,
                    address: Some(address),
                    when: ctx.simulated_time,
                })
            }
            Ok((ns, new_run_mode, maybe_output)) => {
                match (self.run_mode, new_run_mode) {
                    (RunMode::Running, RunMode::InLimbo) => {
                        event!(Level::DEBUG, "Entering LIMBO");
                        self.set_next_execution_due(*now, None);
                    }
                    (RunMode::InLimbo, RunMode::Running) => {
                        event!(Level::DEBUG, "Leaving LIMBO");
                        self.set_next_execution_due(*now, Some(*now + Duration::from_nanos(1)));
                    }
                    (old_run_mode, new_run_mode) => {
                        assert_eq!(old_run_mode, new_run_mode);
                    }
                }
                self.run_mode = new_run_mode;

                if let Some(seq) = hardware_state_changed {
                    // Some instruction changed the hardware, so we need to
                    // poll it again.
                    event!(
                        Level::DEBUG,
                        "hardware state change for unit {seq}; bringing forward next hardware poll"
                    );
                    self.set_next_hw_poll_due(*now, *now + Duration::from_nanos(1));
                } else {
                    event!(
                        Level::TRACE,
                        "current instruction did not affect the hardware"
                    );
                }
                // TODO: eliminate ns, just change state of `self`.
                Ok((ns, maybe_output))
            }
        }
    }

    /// Perform whatever emulation action is due now.  If the TX-2
    /// executes a TSD instruction, return the I/O data being emitted.
    pub fn tick(&mut self, ctx: &Context) -> Result<Option<OutputEvent>, UnmaskedAlarm> {
        let system_time = ctx.simulated_time;
        let tick_span = span!(Level::INFO, "tick", t=?system_time);
        let _enter = tick_span.enter();
        event!(
            Level::TRACE,
            "tick: system_time={:?}, next_execution_due={:?}, next_hw_poll_due={:?}",
            system_time,
            self.next_execution_due,
            self.next_hw_poll_due
        );
        let due: Duration = if let Some(inst_due) = self.next_execution_due {
            min(self.next_hw_poll_due, inst_due)
        } else {
            self.next_hw_poll_due
        };
        if due > system_time {
            let premature_by = due - system_time;
            event!(
                Level::WARN,
                "tick() was called {premature_by:?} prematurely (run mode is {:?})",
                &self.run_mode
            );
        }

        if ctx.simulated_time >= self.next_hw_poll_due {
            event!(
                Level::DEBUG,
                "tick(): polling the hardware (because this is due now)"
            );
            let prev_poll_due = self.next_hw_poll_due;
            match self.poll_hw(ctx) {
                Ok(()) => {
                    if self.next_hw_poll_due == prev_poll_due {
                        event!(
                            Level::WARN,
                            "polled hardware successfully at system time {:?}, but poll_hw returned with next_hw_poll_due={:?}",
                            system_time,
                            self.next_hw_poll_due
                        );
                    }
                }
                Err(alarm) => {
                    return Err(UnmaskedAlarm {
                        alarm,
                        address: None, // not executing an instruction
                        when: ctx.simulated_time,
                    });
                }
            }
        } else {
            event!(
                Level::TRACE,
                "not polling hardware for updates (remaining wait: {:?})",
                self.next_hw_poll_due - system_time,
            );
        }

        if self.run_mode == RunMode::InLimbo {
            // No sequence is active, so there is no CPU instruction
            // to execute.  Therefore we can only leave the limbo
            // state in response to a hardware event.  We already know
            // that we need to check for that at `next_hw_poll`.
            let interval: Duration = self.next_hw_poll_due - system_time;
            event!(
                Level::TRACE,
                "machine is in limbo, waiting {:?} for a flag to be raised",
                &interval,
            );
            // There can be no output event, because no instruction
            // was executed to generate it.
            Ok(None)
        } else if self.unmasked_alarm_active() {
            event!(
                Level::DEBUG,
                "will not execute the next instruction because there is an an unmasked alarm."
            );
            Ok(None) // no output event (as we executed no instruction)
        } else {
            // Not in limbo, it may be time to execute an instruction.
            match self.next_execution_due {
                Some(next) if next <= system_time => {
                    let (ns, maybe_output) = self.execute_one_instruction(ctx)?;
                    let mut due = next + Duration::from_nanos(ns);
                    if due <= system_time {
                        due = system_time + Duration::from_nanos(1);
                    }
                    self.set_next_execution_due(system_time, Some(due));
                    if let Some(output) = maybe_output.as_ref() {
                        self.detect_light_pen_illumination(ctx, output);
                    }
                    Ok(maybe_output)
                }
                None => {
                    event!(
                        Level::TRACE,
                        "instruction execution clock is not running, no instruction to execute"
                    );
                    Ok(None)
                }
                Some(next) => {
                    let wait_for = next - system_time;
                    event!(
                        Level::TRACE,
                        "next instruction execution not due for {wait_for:?}"
                    );
                    Ok(None)
                }
            }
        }
    }

    #[must_use]
    pub fn unmasked_alarm_active(&self) -> bool {
        self.control.unmasked_alarm_active()
    }

    pub fn drain_alarm_changes(&mut self) -> BTreeMap<AlarmKind, AlarmStatus> {
        self.control.drain_alarm_changes()
    }

    pub fn disconnect_all_devices(&mut self, ctx: &Context) -> Result<(), Alarm> {
        self.devices.disconnect_all(ctx, &mut self.control)
    }

    fn extended_state_of_software_sequence(
        &self,
        seq: Unsigned6Bit,
        index_value: Signed18Bit,
    ) -> ExtendedUnitState {
        ExtendedUnitState {
            flag: self.control.current_flag_state(&seq),
            connected: false,
            in_maintenance: false,
            name: format!("Sequence {seq:>02o}"),
            status: None,
            text_info: "(software only)".to_string(),
            index_value,
        }
    }

    fn software_sequence_statuses(&self) -> BTreeMap<Unsigned6Bit, ExtendedUnitState> {
        let regvalues = self.control.inspect_registers();
        [u6!(0), u6!(0o76), u6!(0o77)]
            .into_iter()
            .map(|seq| {
                let index_value: &Signed18Bit = regvalues
                    .index_regs
                    .get(usize::from(seq))
                    .expect("software sequences should all have valid index register values");
                (
                    seq,
                    self.extended_state_of_software_sequence(seq, *index_value),
                )
            })
            .collect()
    }

    pub fn sequence_statuses(
        &mut self,
        ctx: &Context,
    ) -> Result<BTreeMap<Unsigned6Bit, ExtendedUnitState>, Alarm> {
        // Get the status of the hardware units
        let mut result: BTreeMap<Unsigned6Bit, ExtendedUnitState> =
            self.devices.device_statuses(ctx, &mut self.control)?;
        // Merge in the status of the software units
        result.append(&mut self.software_sequence_statuses());
        Ok(result)
    }

    pub fn drain_device_changes(
        &mut self,
        ctx: &Context,
    ) -> Result<BTreeMap<Unsigned6Bit, ExtendedUnitState>, Alarm> {
        let mut mapping = self.devices.drain_changes(ctx, &mut self.control)?;
        for (seq, index_value) in self.control.drain_flag_changes().into_iter() {
            mapping
                .entry(seq)
                .or_insert_with(|| self.extended_state_of_software_sequence(seq, index_value));
        }
        Ok(mapping)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::ScopeOrigin;
    use base::u6;

    fn scope_point(x: i16, y: i16, origin: ScopeOrigin) -> OutputEvent {
        OutputEvent::ScopePoint {
            unit: u6!(0o60),
            x,
            y,
            intensity: 1,
            origin,
        }
    }

    #[test]
    fn light_pen_maps_all_scope_origins_to_the_physical_face() {
        let pen = LightPenPosition {
            active: true,
            x: 511,
            y: 511,
            radius: 2,
        };
        assert!(pen.sees(&scope_point(0, 0, ScopeOrigin::Center)));
        assert!(pen.sees(&scope_point(0, 256, ScopeOrigin::BottomCenter)));
        assert!(pen.sees(&scope_point(256, 0, ScopeOrigin::LeftCenter)));
        assert!(pen.sees(&scope_point(256, 256, ScopeOrigin::LowerLeft)));
        assert!(!pen.sees(&scope_point(0, 0, ScopeOrigin::LowerLeft)));

        let lower_left_pen = LightPenPosition {
            active: true,
            x: 0,
            y: 0,
            radius: 0,
        };
        assert!(lower_left_pen.sees(&scope_point(0, 0, ScopeOrigin::LowerLeft)));
    }

    #[test]
    fn inactive_light_pen_does_not_detect_scope_light() {
        let pen = LightPenPosition {
            active: false,
            x: 511,
            y: 511,
            radius: 20,
        };
        assert!(!pen.sees(&scope_point(0, 0, ScopeOrigin::Center)));
    }
}
