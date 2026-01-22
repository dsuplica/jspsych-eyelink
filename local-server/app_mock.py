from flask import Flask
from flask_socketio import SocketIO, emit
import requests
import pylink
import array
import string
import warnings
import pylink as pl
from flask_cors import CORS
import time
import numpy as np

app = Flask(__name__)
# CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")


LATEST_KEY_RECVD = None

SCREEN_RESOLUTION = (1920, 1080)


def deg2pix(eyeMoveThresh=1.25, distFromScreen=800, monitorWidth=532, screenResX=SCREEN_RESOLUTION[0]):
    """Converts degrees visual angle to a pixel value

    Args:
        eyeMoveThresh (int, optional): threshold (dva). Defaults to 1.
        distFromScreen (int, optional): distance from headrest to screen. Defaults to 900.
        monitorWidth (int, optional): Width of monitor. Defaults to 532.
        screenResX (int, optional): Monitor resolution. Defaults to 1920.

    Returns:
        pix: pixel value
    """

    pix_size_x = monitorWidth / screenResX
    mmfromfix = 2 * distFromScreen * np.tan(0.5 * np.deg2rad(eyeMoveThresh))
    pix = round(mmfromfix / pix_size_x)
    return pix


class EyeMovementError(Exception):
    def __init__(self, message, x, y):
        super().__init__(message)
        self.x = x
        self.y = y


KEYS = {
    "f1": pylink.F1_KEY,
    "f2": pylink.F2_KEY,
    "f3": pylink.F3_KEY,
    "f4": pylink.F4_KEY,
    "f5": pylink.F5_KEY,
    "f6": pylink.F6_KEY,
    "f7": pylink.F7_KEY,
    "f8": pylink.F8_KEY,
    "f9": pylink.F9_KEY,
    "f10": pylink.F10_KEY,
    "pageup": pylink.PAGE_UP,
    "pagedown": pylink.PAGE_DOWN,
    "up": pylink.CURS_UP,
    "down": pylink.CURS_DOWN,
    "left": pylink.CURS_LEFT,
    "right": pylink.CURS_RIGHT,
    "return": pylink.ENTER_KEY,
    "escape": pylink.ESC_KEY,
    "num_add": 43,
    "equal": 43,
    "num_subtract": 45,
    "minus": 45,
    "backspace": ord("\b"),
    "space": ord(" "),
    "tab": ord("\t"),
}

KEYS_OSX = {
    "F1": pylink.F1_KEY,
    "F2": pylink.F2_KEY,
    "F3": pylink.F3_KEY,
    "F4": pylink.F4_KEY,
    "F5": pylink.F5_KEY,
    "F6": pylink.F6_KEY,
    "F7": pylink.F7_KEY,
    "F8": pylink.F8_KEY,
    "F9": pylink.F9_KEY,
    "F10": pylink.F10_KEY,
    "PageUp": pylink.PAGE_UP,
    "PageDown": pylink.PAGE_DOWN,
    "ArrowUp": pylink.CURS_UP,
    "ArrowDown": pylink.CURS_DOWN,
    "ArrowLeft": pylink.CURS_LEFT,
    "ArrowRight": pylink.CURS_RIGHT,
    "Enter": pylink.ENTER_KEY,
    "Escape": pylink.ESC_KEY,
    "NumpadAdd": 43,
    "Equal": 43,
    "NumpadSubtract": 45,
    "Minus": 45,
    "Backspace": ord("\b"),
    " ": ord(" "),
    "Tab": ord("\t"),
}

KEYS.update(KEYS_OSX)


class jsCustomDisplayInterface(pylink.EyeLinkCustomDisplay):

    def __init__(self, tracker):
        pylink.EyeLinkCustomDisplay.__init__(self)
        # adjusted to put center at (0,0)
        self.tracker = tracker

        self.pal = []
        self.image_buffer = array.array("I")

        self.text_color = (-1, -1, -1)

        self.colors = {
            pylink.CR_HAIR_COLOR: (1, 1, 1),
            pylink.PUPIL_HAIR_COLOR: (1, 1, 1),
            pylink.PUPIL_BOX_COLOR: (-1, 1, -1),
            pylink.SEARCH_LIMIT_BOX_COLOR: (1, -1, -1),
            pylink.MOUSE_CURSOR_COLOR: (1, -1, -1),
        }

        self.keys = {
            "f1": pylink.F1_KEY,
            "f2": pylink.F2_KEY,
            "f3": pylink.F3_KEY,
            "f4": pylink.F4_KEY,
            "f5": pylink.F5_KEY,
            "f6": pylink.F6_KEY,
            "f7": pylink.F7_KEY,
            "f8": pylink.F8_KEY,
            "f9": pylink.F9_KEY,
            "f10": pylink.F10_KEY,
            "pageup": pylink.PAGE_UP,
            "pagedown": pylink.PAGE_DOWN,
            "up": pylink.CURS_UP,
            "down": pylink.CURS_DOWN,
            "left": pylink.CURS_LEFT,
            "right": pylink.CURS_RIGHT,
            "return": pylink.ENTER_KEY,
            "escape": pylink.ESC_KEY,
            "num_add": 43,
            "equal": 43,
            "num_subtract": 45,
            "minus": 45,
            "backspace": ord("\b"),
            "space": ord(" "),
            "tab": ord("\t"),
        }
        self.mouse = None

    def setup_cal_display(self):
        """Clears window on calibration setup."""
        emit("setupCalDisplay", broadcast=True)

    def exit_cal_display(self):
        """Clears window on calibration exit."""
        emit("exitCalDisplay", broadcast=True)

    def clear_cal_display(self):
        """Clears calibration targets."""
        emit("clearCalDisplay", broadcast=True)

    def erase_cal_target(self):
        """Clears a individual calibration target."""
        emit("eraseCalTarget", broadcast=True)

    def draw_cal_target(self, x, y):
        print("DRAW TARGET")
        """Draws calibration targets."""
        emit("drawCalTarget", {"x": x, "y": y}, broadcast=True)

    def get_input_key(self):
        """Handles key events."""
        pass

        # if keycode in self.keys:
        #     key = self.keys[keycode]
        # elif keycode in string.ascii_letters:
        #     key = ord(keycode)
        # else:
        #     key = pylink.JUNK_KEY

        # # mod = 256 if modifiers['alt'] else 0
        # keys = pylink.KeyInput(key, 0)

        # return keys

    def alert_printf(self, msg):
        """Prints warnings, but doesn't kill session."""
        warnings.warn(msg, RuntimeWarning)


@socketio.on("connect")
def handle_connect():
    print("Client connected")
    socketio.emit("server_response", {"data": "Connected"})


@socketio.on("key_event")
def handle_key_event(keycode):

    if keycode in KEYS:
        key = KEYS[keycode]
        print(keycode, KEYS[keycode])
    elif keycode in string.ascii_letters:
        key = ord(keycode)
    else:
        key = pylink.JUNK_KEY

    # return pylink.KeyInput(key, 0)
    print(f"Received key event: {keycode,key}")

    if keycode == "c":
        emit("setupCalDisplay", broadcast=True)
        emit("drawCalTarget", {"x": 960, "y": 540})

    # tracker.getCustomDisplay().get_input_key(key)
    # tracker.echo_key()
    # global LATEST_KEY_RECVD
    # LATEST_KEY_RECVD = key
    # tracker.getCustomDisplay().get_input_key()


@socketio.on("startRecording")
def start_recording():
    print(f"Starting recording at {time.time()}")


@socketio.on("stopRecording")
def stop_recording():
    print(f"Stopping recording at {time.time()}")


@socketio.on("calibrate")
def calibrate():
    print("Starting calibration")


@socketio.on("drift_correct")
def drift_correct():
    print("Starting drift correction")


@socketio.on("event")
def send_synced_event(data, keyword="SYNC"):
    code = data.get("code")
    print(f"Received event: {code}")
    message = keyword + " " + str(code)
    print(message)
    # Handle different events here


@socketio.on("trial_status")
def send_trial_status(data):
    status = data.get("status")
    print(f"Received trial status: {status}")


def sleep(duration):
    start_time = time.perf_counter()
    while (time.perf_counter() - start_time) < duration:
        pass


def gaze_data():
    """

    Contains a tuple with gaze data. If both eyes are being tracked the tuple contains two
        tuples. Each tuple of gaze data contains an x and y value in pixels.

    """
    winx = SCREEN_RESOLUTION[0] / 2
    winy = SCREEN_RESOLUTION[1] / 2

    return ((winx, winy), (winx, winy))


def check_eyetracker(max_dist):
    """
    gets realtime eyetracking data and determines whether to reject the trial
    Options:

    """

    left, right = gaze_data()  # this used to be gaze_data_both

    if left is not None and right is not None:
        lx, ly = left
        rx, ry = right
        x = np.nanmean([lx, rx])
        y = np.nanmean([ly, ry])
    elif left is not None:
        x, y = left
    elif right is not None:
        x, y = right
    else:  # if no eye data do not reject
        return

    # get the x,y pixel values relative to the center of the screen
    winx = SCREEN_RESOLUTION[0] / 2
    winy = SCREEN_RESOLUTION[1] / 2

    x -= winx
    y -= winy

    dist = np.linalg.norm(np.array([x, y]))

    if dist > max_dist:

        raise EyeMovementError("Eye Movement Detected", x, y)


REALTIME_SRATE = 0.05


@socketio.on("realtime_eyetrack")
def realtime_eyetrack(data):
    print("Starting real-time eyetracking")
    duration = data.get("duration")
    eyeMaxDist = deg2pix(data.get("eyeMaxDist", 1.25))
    start_time = time.perf_counter()
    try:
        while (time.perf_counter() - start_time) < duration:
            check_eyetracker(eyeMaxDist)

            sleep(REALTIME_SRATE)
    except EyeMovementError as e:
        emit("eyeMovementDetected", {"x": e.x, "y": e.y})
    print("Stopping real-time eyetracking")


if __name__ == "__main__":
    # try:
    socketio.run(app, port=5001, debug=True)
    # except:
    #     tracker.closeDataFile()
