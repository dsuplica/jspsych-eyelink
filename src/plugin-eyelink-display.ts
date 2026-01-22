import { JsPsych, ParameterType } from "jspsych";
import type { JsPsychPlugin, TrialType } from "jspsych";
import type { EyeLinkExtensionInterface } from "./extension-eyelink";

import { Canvas, Circle, Group, FabricText } from "fabric";

// extend fabric types to include id
declare module "fabric" {
  export interface FabricObject {
    id?: string;
  }
}

const info = <const>{
  name: "eyelink-display",
  version: "1.0.0",
  parameters: {
    /** Provide a clear description of the parameter_name that could be used as documentation. We will eventually use these comments to automatically build documentation and produce metadata. */
    command: {
      type: ParameterType.STRING,
      default: "calibrate",
      description: "Command to send to eyelink",
    },
    hostname: {
      type: ParameterType.STRING,
      default: "localhost",
      description: "Hostname for the websocket connection",
    },
    port: {
      type: ParameterType.INT,
      default: 5001,
      description: "Port number for the websocket connection",
    },
    screen_resolution: {
      type: ParameterType.INT,
      array: true,
      default: [1280, 720],
      description: "Screen resolution [width, height] in pixels",
    },
  },
  data: {
    /** name of this trial */
    command: {
      type: ParameterType.STRING,
    },
  },
  // prettier-ignore
  citations: '__CITATIONS__',
};

type Info = typeof info;

// fabric canvas for displaying objects
// graphics go here
class EyeLinkCanvas extends Canvas {
  constructor(
    el: string | HTMLElement = "jspsych-content",
    width: number = 1920,
    height: number = 1080,
  ) {
    let canvasElement: HTMLCanvasElement | string;
    const display_element =
      typeof el == "string" ? document.getElementById(el) : el;
    if (display_element === null) {
      throw new Error(`Element with id ${el} not found`);
    }
    if (display_element.tagName !== "CANVAS") {
      display_element.innerHTML =
        "<div id='wm-canvas-wrapper' style='position: relative; width:" +
        width +
        "px; height:" +
        height +
        "px'></div>";

      display_element.querySelector("#wm-canvas-wrapper")!.innerHTML +=
        "<canvas id='c', width = '" +
        width +
        "', height = '" +
        height +
        "'/canvas>";

      canvasElement = "c";
    } else {
      canvasElement = display_element as HTMLCanvasElement;
    }

    super(canvasElement, {
      width: width,
      height: height,
      renderOnAddRemove: false,
      selection: false,
      backgroundColor: "#9e9e9e",
    });
  }

  clearScreen = (pattern: RegExp | null = null): void => {
    if (pattern) {
      this.getObjects().forEach((o) => {
        if (o.id) {
          if (pattern.test(o.id)) {
            this.remove(o);
          }
        }
      });
    } else {
      this.getObjects().forEach((o) => {
        if (!o.id) {
          this.remove(o);
        }
      });
    }
    this.renderAll();
  };

  drawCalibrationTarget = (x: number, y: number): void => {
    const target = new Group([
      new Circle({
        left: x,
        top: y,
        fill: "#FFF",
        radius: 22,
        originX: "center",
        originY: "center",
      }),
      new Circle({
        left: x,
        top: y,
        fill: "#000",
        radius: 20,
        originX: "center",
        originY: "center",
      }),
      new Circle({
        left: x,
        top: y,
        fill: "#FFF",
        radius: 8,
        originX: "center",
        originY: "center",
      }),
    ]);

    this.add(target);
    this.renderAll();
  };

  textScreen = (
    text: string,
    fontSize: number = 30,
    color: string = "#FFFFFF",
  ): void => {
    const textObj = new FabricText(text, {
      id: "textScreen",
      fontSize: fontSize,
      fill: color,
      hasBorders: false,
      hasControls: false,
      hoverCursor: "default",
      lockMovementX: true,
      lockMovementY: true,
    });
    this.add(textObj);
    this.centerObject(textObj);
    this.renderAll();
  };
}

/**
 * **{plugin-eyelink}**
 *
 *
 * @author {Darius Suplica}
 */
class EyeLinkPlugin implements JsPsychPlugin<Info> {
  static info = info;

  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: TrialType<Info>): void {
    // connect to websocket
    const eyelink = this.jsPsych.extensions
      .eyelink as EyeLinkExtensionInterface;
    const socket = eyelink.socket;

    console.log(trial.command);

    const canvas = new EyeLinkCanvas(
      display_element,
      trial.screen_resolution![0],
      trial.screen_resolution![1],
    );

    let OKeyListener: ((e: KeyboardEvent) => void) | undefined;

    // send command to the server
    if (!trial.command) {
      throw new Error("Trial command is required");
    }
    socket.emit(trial.command);
    console.log(`Sent command: ${trial.command}`);

    // set up keyboard listener to send ALL keypresses to eyelink
    const keyListener = this.jsPsych.pluginAPI.getKeyboardResponse({
      callback_function: (key: { key: string; rt: number }) => {
        socket.emit("key_event", key.key);
        console.log(`Sent key event: ${key.key}`);
      },
      persist: true,
    });

    // Cleanup function to remove all listeners
    const cleanupListeners = () => {
      socket.off("drawCalTarget");
      socket.off("eraseCalTarget");
      socket.off("setupCalDisplay");
      socket.off("clearCalDisplay");
      socket.off("exitCalDisplay");
      if (OKeyListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(OKeyListener);
      }
      this.jsPsych.pluginAPI.cancelKeyboardResponse(keyListener);
    };

    // this is the main command that will draw the calibration/validation target
    socket.on("drawCalTarget", (data: { x: number; y: number }) => {
      canvas.clearScreen(/.+/);
      console.log("drawCalTarget event received", data);
      canvas.drawCalibrationTarget(data.x, data.y);
    });

    socket.on("eraseCalTarget", () => {
      console.log("eraseCalTarget event received");
      canvas.clearScreen(/calibrationTarget/);
    });

    // this is the command that starts calibration/validation
    socket.on("setupCalDisplay", () => {
      if (OKeyListener) {
        this.jsPsych.pluginAPI.cancelKeyboardResponse(OKeyListener);
      }
      console.log("setupCalDisplay event received");
      canvas.clearScreen();
    });
    socket.on("clearCalDisplay", () => {
      console.log("clearCalDisplay event received");
      canvas.clearScreen(/calibrationTarget/);
    });

    // when done with calibration/validation
    socket.on("exitCalDisplay", () => {
      console.log("exitCalDisplay event received");
      canvas.clearScreen();

      canvas.textScreen("C: calibrate, V: validate, O: output/record");

      OKeyListener = this.jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: () => {
          // disable listeners and continue
          cleanupListeners();
          this.jsPsych.pluginAPI.clearAllTimeouts();
          canvas.clearScreen();
          canvas.dispose();

          this.jsPsych.finishTrial({ command: trial.command });
        },
        valid_responses: ["o"],
      });
    });
  }
}
export default EyeLinkPlugin;
