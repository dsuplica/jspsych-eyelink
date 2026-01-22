import { JsPsych } from "jspsych";
import type { JsPsychExtension, JsPsychExtensionInfo } from "jspsych";

import { io, Socket } from "socket.io-client";

import { version } from "../package.json";

interface InitParams {
  hostname: string;
  port: number;
  record: boolean;
  dummy: boolean;
}

export interface EyeLinkExtensionInterface extends JsPsychExtension {
  initialize: (params: InitParams) => Promise<void>;
  on_load: () => Promise<void>;
  on_finish: () => Promise<void>;
  sendEventCode: (eventCode: number) => void;
  sendTrialStatus: (status: string) => void;
  realtimeEyeTrack: (
    duration: number,
    callback_function: () => void,
    eyeMaxDist?: number,
  ) => void;
  socket: Socket;
}

/**
 * **{extension-eyelink}**
 *
 *
 * @author {Darius Suplica}
 *
 */

class EyeLinkExtension implements EyeLinkExtensionInterface {
  static info: JsPsychExtensionInfo = {
    name: "eyelink",
    version: version,
    data: {},
    // prettier-ignore
    citations: '__CITATIONS__',
  };

  //@ts-expect-error notassigned
  socket: Socket;

  constructor(private jsPsych: JsPsych) {}

  // set initial state of the extension
  // this function runs when called by jsPsych.init()
  initialize = (params: InitParams): Promise<void> => {
    return new Promise((resolve, reject) => {
      // connect to host
      this.socket = io(`${params.hostname}:${params.port}`);
      this.socket.on("connect", () => {
        console.log("Connected to EyeLink server");
        resolve();
      });
      this.socket.on("connect_error", (err: Error) => {
        document.body.innerHTML = `<h1>Could not connect to EyeLink server</h1><h2>Please make sure the EyeLink server is running and reachable at ${params.hostname}:${params.port}</h2>`;

        console.error("Connection error to EyeLink server:", err);
        reject(err);
      });
    });
  };

  // runs BEFORE plugin.trial() is loaded
  on_start = () => {};

  // runs after plugin.trial() loaded but before executing
  on_load = (): Promise<void> => {
    return new Promise((resolve) => {
      const message = `block ${this.jsPsych.evaluateTimelineVariable("block") + 1}, trial ${this.jsPsych.evaluateTimelineVariable("trial") + 1}`;
      this.sendTrialStatus(message);

      this.socket.emit("startRecording");
      // 100ms delay suggested by eyelink to avoid port codes being truncated
      this.jsPsych.pluginAPI.setTimeout(() => {
        resolve();
      }, 100);
    });
  };

  // runs after trial finishes but before finish_trial()
  on_finish = (): Promise<void> => {
    return new Promise((resolve) => {
      this.jsPsych.pluginAPI.setTimeout(() => {
        // 100ms delay before we stop recording
        this.socket.emit("stopRecording");
        resolve();
      }, 100);
    });
  };

  /*
   * call this function when you want to start realtime eyetracking
   * Eyetracking logic is handled by the server, currently can't be interrupted
   * and you must specify a static duration to record for
   */
  public realtimeEyeTrack = (
    duration: number,
    callback_function: () => void,
    eyeMaxDist: number = 1.25,
  ): void => {
    // Remove any existing listener to prevent memory leaks
    this.socket.off("eyeMovementDetected");

    // start realtime eyetracking
    this.socket.emit("realtime_eyetrack", {
      duration,
      eyeMaxDist,
    });

    this.socket.on(
      "eyeMovementDetected",
      (data: { x: number; y: number }): void => {
        console.log("Eye movement detected:", data);
        this.jsPsych.data.addProperties({
          eyeMovementDetected: true,
          eyeMovementX: data.x,
          eyeMovementY: data.y,
        });
        callback_function();
      },
    );
  };

  // this function should be used for port codes
  public sendEventCode(eventCode: number): void {
    this.socket.emit("event", { code: eventCode });
  }

  // this function should be used for the trial status label in the eyetracker
  public sendTrialStatus(status: string): void {
    if (status.length > 80) {
      console.warn(
        "Trial status message too long, truncating to 80 characters.",
      );
      status = status.slice(0, 80);
    }
    this.socket.emit("trial_status", { status });
  }
}

export default EyeLinkExtension;
