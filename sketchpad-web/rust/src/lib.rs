#![deny(unsafe_code)]
#![deny(unreachable_pub)]
#![deny(unused_crate_dependencies)]

use std::time::Duration;

use base::charset::LincolnChar;
use base::prelude::Unsigned9Bit;
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
            Ok(Some(output)) => serde_wasm_bindgen::to_value(&BrowserOutput::from_timed(
                output,
                self.simulated_time,
            ))
            .map_err(|error| JsValue::from_str(&error.to_string())),
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

    pub fn light_pen_detected(&mut self, real_elapsed_seconds: f64) -> Result<bool, JsValue> {
        let ctx = context(self.simulated_time, real_elapsed_seconds);
        self.tx2
            .light_pen_detected(&ctx)
            .map(|raised| raised == InputFlagRaised::Yes)
            .map_err(|error| JsValue::from_str(&error.to_string()))
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

    #[wasm_bindgen(getter)]
    pub fn simulated_time(&self) -> f64 {
        self.simulated_time.as_secs_f64()
    }

    #[wasm_bindgen(getter)]
    pub fn alarm_active(&self) -> bool {
        self.tx2.unmasked_alarm_active()
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
        assert_eq!(SKETCHPAD.len(), 74_232);
    }

    #[test]
    fn disconnected_light_pen_does_not_raise_a_flag() {
        let mut machine = SketchpadMachine::new();
        assert!(matches!(machine.light_pen_detected(0.0), Ok(false)));
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
}
