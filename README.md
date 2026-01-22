# jspsych-eyelink

A jsPsych extension and plugin for interfacing with SR Research EyeLink eye trackers. Enables real-time eye-tracking data collection, calibration management, and synchronized event recording during psychological experiments.

## Features

- Real-time eye tracking with gaze data collection
- Automatic calibration and validation display
- Event-synchronized port codes for neurophysiological recording
- Trial status labeling and monitoring
- WebSocket-based communication with EyeLink server
- Calibration target visualization on canvas
- Keyboard-based calibration/validation control


## Modules

### 1. EyeLinkExtension (`extension-eyelink.ts`)

A jsPsych extension that manages the connection and communication with the EyeLink server.

#### Initialization

```typescript
jsPsych.init({
  extensions: [
    {
      type: EyeLinkExtension,
      params: {
        hostname: 'localhost',
        port: 5001,
        record: true,
        dummy: false
      }
    }
  ]
})
```

#### Parameters

- `hostname` (string): Server hostname or IP address. Default: `localhost`
- `port` (number): WebSocket port number. Default: `5001`
- `record` (boolean): Enable recording (for future use)
- `dummy` (boolean): Run in dummy mode without actual hardware (for future use)

#### Methods

##### `initialize(params: InitParams): Promise<void>`
Establishes connection to the EyeLink server. Automatically called by jsPsych during initialization.

##### `sendEventCode(eventCode: number): void`
Sends a numeric event code to the EyeLink tracker for synchronization with EEG/eyetracker recordings.

Example:
```typescript
const eyelink = jsPsych.extensions.eyelink;
eyelink.sendEventCode(10); // Send port code 10
```

##### `sendTrialStatus(status: string): void`
Sends a trial status message (max 80 characters) to be recorded in the EyeLink data file. Automatically truncates messages exceeding 80 characters with a warning.

Example:
```typescript
eyelink.sendTrialStatus('Block 1, Trial 5');
```

##### `realtimeEyeTrack(duration: number, callback_function: () => void, eyeMaxDist?: number): void`
Monitors eye position during a trial and triggers a callback if gaze deviates beyond specified threshold.

Parameters:
- `duration` (number): Duration in milliseconds to monitor gaze
- `callback_function` (function): Called when eye movement is detected
- `eyeMaxDist` (number, optional): Maximum gaze deviation in degrees of visual angle. Default: `1.25`

Example:
```typescript
eyelink.realtimeEyeTrack(5000, () => {
  console.log('Eye movement detected!');
}, 1.5);
```

### 2. EyeLinkPlugin (`plugin-eyelink-display.ts`)

A jsPsych plugin that displays calibration/validation targets and handles user input during eye tracker setup.

#### Trial Parameters

```javascript
{
  type: EyeLinkPlugin,
  command: 'calibrate',
  hostname: 'localhost',
  port: 5001,
  screen_resolution: [1920, 1080]
}
```

#### Parameters

- `command` (string): Command to send to the EyeLink server. Default: `'calibrate'`
  - Common commands: `'calibrate'`, `'drift_correct'`
- `hostname` (string): Server hostname. Default: `'localhost'`
- `port` (number): WebSocket port. Default: `5001`
- `screen_resolution` (array): Display resolution [width, height] in pixels. Default: `[1280, 720]`

#### Trial Data

The plugin records the following data:
- `command` (string): The command that was sent

#### Behavior

- Displays a canvas for drawing calibration/validation targets
- Listens for the following server events:
  - `drawCalTarget`: Displays calibration target at specified coordinates
  - `eraseCalTarget`: Removes calibration target
  - `setupCalDisplay`: Prepares display for calibration setup
  - `clearCalDisplay`: Clears calibration targets
  - `exitCalDisplay`: Exits calibration mode and displays control instructions
- Captures all keyboard input and sends to EyeLink server
- On key press 'O', concludes calibration and finishes the trial

## Server

A corresponding EyeLink server is required to run in parallel with the jsPsych experiment.

### Running the Server

Two server implementations are provided in the `local-server` directory:

1. **app.py** - Full EyeLink server (requires actual EyeLink hardware and pylink library)
   ```bash
   cd local-server
   python app.py
   ```

2. **app_mock.py** - Mock server for testing without hardware
   ```bash
   cd local-server
   python app_mock.py
   ```

Both servers run on port 5001 by default and communicate via Socket.IO WebSocket connections.

### Server Requirements

The server should:
- Listen on the specified hostname and port
- Emit calibration target coordinates via `drawCalTarget` events
- Handle keyboard input events
- Manage EyeLink hardware communication (or simulate it)

## Usage Example

```typescript
const trial = {
  type: EyeLinkPlugin,
  command: 'calibrate',
  hostname: 'localhost',
  port: 5001,
  screen_resolution: [1920, 1080]
};

const timeline = [trial];

jsPsych.run(timeline);
```

## Event Flow

1. Trial starts and sends command to EyeLink server
2. Server responds with calibration display events
3. Calibration targets are drawn and erased on canvas
4. User completes calibration/validation with keyboard input
5. On 'O' key press, trial ends and listeners are cleaned up

## Error Handling

- Connection errors to EyeLink server display an error message with connection details
- Trial command validation ensures command is provided before trial execution
- Trial status messages are automatically truncated if exceeding 80 characters
- All socket listeners are properly cleaned up when trials end to prevent memory leaks

## Socket Communication

Communication with the EyeLink server is handled via Socket.IO. The following events are used:

### Client-to-Server
- `event`: Send port codes for synchronization
- `key_event`: Send keyboard input
- `startRecording`: Begin data recording
- `stopRecording`: End data recording
- `trial_status`: Send trial status message
- `realtime_eyetrack`: Request real-time gaze monitoring
- `calibrate`, `drift_correct`: Calibration commands

### Server-to-Client
- `drawCalTarget`: Request to draw calibration target
- `eraseCalTarget`: Request to erase calibration target
- `setupCalDisplay`: Prepare display for calibration
- `clearCalDisplay`: Clear current display
- `exitCalDisplay`: Exit calibration mode
- `eyeMovementDetected`: Notification of detected eye movement

## TypeScript Support

Full TypeScript support is included. The main interfaces are:

- `EyeLinkExtensionInterface`: Methods and properties of the extension
- `InitParams`: Parameters for extension initialization
- `Info`: Trial parameter type information for the plugin

## Known Limitations

- Requires static duration specification for real-time eye tracking

## Author

Darius Suplica
