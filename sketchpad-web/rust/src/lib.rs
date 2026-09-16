#![deny(unsafe_code)]
#![deny(unreachable_pub)]
#![deny(unused_crate_dependencies)]

use std::time::Duration;

use base::charset::LincolnChar;
use base::prelude::{Unsigned5Bit, Unsigned6Bit, Unsigned9Bit, Unsigned18Bit};
use cpu::{
    AlarmKind, Context, InputFlagRaised, MemoryConfiguration, OutputEvent, PanicOnUnmaskedAlarm,
    ResetMode, RunMode, ScopeOrigin, Tx2,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

const SCOPE_DEMO: &[u8] = include_bytes!("../../../examples/scope.tape");
const SKETCHPAD: &[u8] = include_bytes!("../assets/sketchpad-combined.tape");

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum BrowserOutput {
    ScopePoint {
        at_seconds: f64,
        unit: u8,
        x: i16,
        y: i16,
        intensity: u8,
        origin: &'static str,
    },
    LincolnWriter {
        at_seconds: f64,
        unit: u8,
        text: Option<String>,
        advance: bool,
    },
}

#[derive(Debug, Serialize)]
struct BrowserUnitStatus {
    unit: u8,
    index_value: i32,
    flag: bool,
    connected: bool,
    in_maintenance: bool,
    name: String,
    text: String,
    mode: Option<u16>,
}

#[derive(Debug, Serialize)]
struct BrowserMemoryWord {
    value: u64,
    meta: bool,
}

#[derive(Debug, Serialize)]
struct BrowserControlState {
    sequence: Option<u8>,
    program_counter: u32,
    instruction_address: u32,
    instruction: String,
    configuration_address: u8,
    system_configuration: u16,
}

fn scope_origin_name(origin: ScopeOrigin) -> &'static str {
    match origin {
        ScopeOrigin::Center => "center",
        ScopeOrigin::BottomCenter => "bottom_center",
        ScopeOrigin::LeftCenter => "left_center",
        ScopeOrigin::LowerLeft => "lower_left",
    }
}

impl BrowserOutput {
    fn from_timed(event: OutputEvent, at: Duration) -> Self {
        match event {
            OutputEvent::ScopePoint {
                unit,
                x,
                y,
                intensity,
                origin,
            } => BrowserOutput::ScopePoint {
                at_seconds: at.as_secs_f64(),
                unit: unit.into(),
                x,
                y,
                intensity,
                origin: scope_origin_name(origin),
            },
            OutputEvent::LincolnWriterPrint { unit, ch } => {
                let text = ch.unicode_representation.or(match ch.base_char {
                    LincolnChar::UnicodeBaseChar(c) => Some(c),
                    LincolnChar::Unprintable(_) => None,
                });
                BrowserOutput::LincolnWriter {
                    at_seconds: at.as_secs_f64(),
                    unit: unit.into(),
                    text: text.map(|c| c.to_string()),
                    advance: ch.advance,
                }
            }
        }
    }
}

fn context(simulated_time: Duration, real_elapsed_seconds: f64) -> Context {
    Context::new(
        simulated_time,
        Duration::from_secs_f64(real_elapsed_seconds.max(0.0)),
    )
}

#[wasm_bindgen]
pub struct SketchpadMachine {
    tx2: Tx2,
    simulated_time: Duration,
    last_alarm: Option<String>,
}

#[wasm_bindgen]
impl SketchpadMachine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        let simulated_time = Duration::ZERO;
        let ctx = context(simulated_time, 0.0);
        let memory = MemoryConfiguration {
            with_u_memory: false,
        };
        let mut tx2 = Tx2::new(&ctx, PanicOnUnmaskedAlarm::No, &memory);
        tx2.set_alarm_masked(AlarmKind::IOSAL, true)
            .expect("IOSAL is a maskable TX-2 alarm");
        Self {
            tx2,
            simulated_time,
            last_alarm: None,
        }
    }

    pub fn mount_tape(&mut self, bytes: &[u8], real_elapsed_seconds: f64) -> Result<bool, JsValue> {
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        self.tx2
            .mount_paper_tape(&ctx, bytes.to_vec())
            .map(|raised| raised == InputFlagRaised::Yes)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn codabo(&mut self, real_elapsed_seconds: f64) -> Result<(), JsValue> {
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        self.last_alarm = None;
        self.tx2
            .codabo(&ctx, &ResetMode::ResetTSP)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.tx2
            .set_next_execution_due(self.simulated_time, Some(self.simulated_time));
        self.tx2.set_run_mode(RunMode::Running);
        Ok(())
    }

    pub fn step(&mut self, real_elapsed_seconds: f64) -> Result<JsValue, JsValue> {
        self.simulated_time = self.tx2.next_tick();
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        match self.tx2.tick(&ctx) {
            Ok(Some(output)) => {
                let output = BrowserOutput::from_timed(output, self.simulated_time);
                serde_wasm_bindgen::to_value(&output)
                    .map_err(|error| JsValue::from_str(&error.to_string()))
            }
            Ok(None) => Ok(JsValue::NULL),
            Err(error) => {
                let message = error.to_string();
                self.last_alarm = Some(message.clone());
                Err(JsValue::from_str(&message))
            }
        }
    }

    pub fn step_batch(
        &mut self,
        real_elapsed_seconds: f64,
        maximum_ticks: u32,
    ) -> Result<JsValue, JsValue> {
        let mut outputs = Vec::new();
        for _ in 0..maximum_ticks {
            self.simulated_time = self.tx2.next_tick();
            let ctx = context(self.simulated_time, real_elapsed_seconds);
            match self.tx2.tick(&ctx) {
                Ok(Some(output)) => {
                    outputs.push(BrowserOutput::from_timed(output, self.simulated_time));
                }
                Ok(None) => (),
                Err(error) => {
                    let message = error.to_string();
                    self.last_alarm = Some(message.clone());
                    return Err(JsValue::from_str(&message));
                }
            }
        }
        serde_wasm_bindgen::to_value(&outputs)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn set_light_pen(
        &mut self,
        x: f64,
        y: f64,
        radius: f64,
        active: bool,
    ) -> Result<(), JsValue> {
        if !x.is_finite() || !y.is_finite() || !radius.is_finite() || radius < 0.0 {
            return Err(JsValue::from_str("light-pen values must be finite"));
        }
        let scope_coordinate =
            |normalized: f64| (normalized.clamp(0.0, 1.0) * 1022.0).round() as u16;
        self.tx2.set_light_pen_position(
            scope_coordinate(x),
            scope_coordinate(1.0 - y),
            scope_coordinate(radius),
            active,
        );
        Ok(())
    }

    pub fn set_knob_register(
        &mut self,
        quarter_4: u16,
        quarter_3: u16,
        quarter_2: u16,
        quarter_1: u16,
        meta: bool,
    ) -> Result<(), JsValue> {
        let convert = |value| {
            Unsigned9Bit::try_from(value)
                .map_err(|_| JsValue::from_str("a knob value must be between 0 and 511"))
        };
        self.tx2.set_knob_register(
            [
                convert(quarter_4)?,
                convert(quarter_3)?,
                convert(quarter_2)?,
                convert(quarter_1)?,
            ],
            meta,
        );
        Ok(())
    }

    pub fn set_external_input_register(
        &mut self,
        quarter_4: u16,
        quarter_3: u16,
        quarter_2: u16,
        quarter_1: u16,
        meta: bool,
    ) -> Result<(), JsValue> {
        let convert = |value| {
            Unsigned9Bit::try_from(value)
                .map_err(|_| JsValue::from_str("a button quarter must be between 0 and 511"))
        };
        self.tx2.set_external_input_register(
            [
                convert(quarter_4)?,
                convert(quarter_3)?,
                convert(quarter_2)?,
                convert(quarter_1)?,
            ],
            meta,
        );
        Ok(())
    }

    pub fn set_toggle_register(
        &mut self,
        register: u8,
        quarter_4: u16,
        quarter_3: u16,
        quarter_2: u16,
        quarter_1: u16,
        meta: bool,
    ) -> Result<(), JsValue> {
        if register >= 24 {
            return Err(JsValue::from_str(
                "a toggle register number must be between 0 and 23",
            ));
        }
        let convert = |value| {
            Unsigned9Bit::try_from(value)
                .map_err(|_| JsValue::from_str("a toggle quarter must be between 0 and 511"))
        };
        self.tx2.set_toggle_register(
            Unsigned5Bit::try_from(register)
                .expect("a validated toggle register fits in five bits"),
            [
                convert(quarter_4)?,
                convert(quarter_3)?,
                convert(quarter_2)?,
                convert(quarter_1)?,
            ],
            meta,
        );
        Ok(())
    }

    /// Return one hardware or software sequence state for diagnostics.
    pub fn unit_status(&mut self, unit: u8, real_elapsed_seconds: f64) -> Result<JsValue, JsValue> {
        let unit = Unsigned6Bit::try_from(unit)
            .map_err(|_| JsValue::from_str("a unit number must be between 0 and 63"))?;
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        let mut statuses = self
            .tx2
            .sequence_statuses(&ctx)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let status = statuses
            .remove(&unit)
            .ok_or_else(|| JsValue::from_str("the requested unit is not attached"))?;
        let result = BrowserUnitStatus {
            unit: unit.into(),
            index_value: status.index_value.into(),
            flag: status.flag,
            connected: status.connected,
            in_maintenance: status.in_maintenance,
            name: status.name,
            text: status.text_info,
            mode: status.status.map(|connected| connected.mode),
        };
        serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// Inspect one memory word for an emulator acceptance test.
    pub fn memory_word(
        &mut self,
        address: u32,
        real_elapsed_seconds: f64,
    ) -> Result<JsValue, JsValue> {
        let address = Unsigned18Bit::try_from(address)
            .map_err(|_| JsValue::from_str("a memory address must be an 18-bit value"))?;
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        let (value, meta) = self
            .tx2
            .inspect_memory_word(&ctx, address)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&BrowserMemoryWord { value, meta })
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// Inspect the current control state for an emulator acceptance test.
    pub fn control_state(&self) -> Result<JsValue, JsValue> {
        let (sequence, program_counter, instruction_address, instruction) =
            self.tx2.inspect_control_state();
        let (configuration_address, system_configuration) =
            self.tx2.inspect_current_configuration();
        serde_wasm_bindgen::to_value(&BrowserControlState {
            sequence,
            program_counter,
            instruction_address,
            instruction,
            configuration_address,
            system_configuration,
        })
        .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// Inspect one index register for an emulator acceptance test.
    pub fn index_register(&self, register: u8) -> Result<i32, JsValue> {
        let register = Unsigned6Bit::try_from(register)
            .map_err(|_| JsValue::from_str("an index register must be between 0 and 63"))?;
        Ok(self.tx2.inspect_index_register(register))
    }

    /// Inspect one sequence flag for an emulator acceptance test.
    pub fn sequence_flag(&self, sequence: u8) -> Result<bool, JsValue> {
        let sequence = Unsigned6Bit::try_from(sequence)
            .map_err(|_| JsValue::from_str("a sequence must be between 0 and 63"))?;
        Ok(self.tx2.inspect_sequence_flag(sequence))
    }

    #[wasm_bindgen(getter)]
    pub fn simulated_time(&self) -> f64 {
        self.simulated_time.as_secs_f64()
    }

    #[wasm_bindgen(getter)]
    pub fn alarm_active(&self) -> bool {
        self.tx2.unmasked_alarm_active()
    }

    #[wasm_bindgen(getter)]
    pub fn light_pen_detection_count(&self) -> u64 {
        self.tx2.light_pen_detection_count()
    }

    #[wasm_bindgen(getter)]
    pub fn last_alarm(&self) -> Option<String> {
        self.last_alarm.clone()
    }
}

impl Default for SketchpadMachine {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
pub fn scope_demo_tape() -> Vec<u8> {
    SCOPE_DEMO.to_vec()
}

#[wasm_bindgen]
pub fn sketchpad_tape() -> Vec<u8> {
    SKETCHPAD.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base::u6;

    #[test]
    fn converts_scope_event_for_the_browser() {
        let event = BrowserOutput::from_timed(
            OutputEvent::ScopePoint {
                unit: u6!(0o60),
                x: -12,
                y: 34,
                intensity: 3,
                origin: ScopeOrigin::LowerLeft,
            },
            Duration::from_micros(20),
        );
        let BrowserOutput::ScopePoint {
            at_seconds,
            unit,
            x,
            y,
            intensity,
            origin,
        } = event
        else {
            panic!("expected a scope point")
        };
        assert_eq!((unit, x, y, intensity), (0o60, -12, 34, 3));
        assert_eq!(origin, "lower_left");
        assert_eq!(at_seconds, 0.000_020);
    }

    #[test]
    fn bundled_scope_tape_is_present() {
        assert!(SCOPE_DEMO.len() > 700);
    }

    #[test]
    fn bundled_sketchpad_tape_is_present() {
        assert_eq!(SKETCHPAD.len(), 78_186);
    }

    #[test]
    fn accepts_full_range_shaft_encoder_values() {
        let mut machine = SketchpadMachine::new();
        assert!(
            machine
                .set_knob_register(0, 0o777, 0o123, 0o456, true)
                .is_ok()
        );
    }

    #[test]
    fn accepts_simultaneous_external_input_buttons() {
        let mut machine = SketchpadMachine::new();
        assert!(
            machine
                .set_external_input_register(0o400, 0o200, 0o100, 0o001, true)
                .is_ok()
        );
    }

    #[test]
    fn accepts_manual_toggle_register_state() {
        let mut machine = SketchpadMachine::new();
        assert!(
            machine
                .set_toggle_register(0o27, 0o400, 0o200, 0o100, 0o001, true)
                .is_ok()
        );
    }
}
