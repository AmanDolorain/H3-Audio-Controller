# H3 Audio Controller — v1.0.0

Author: Aman Dolorain · 2026-10-28

Load an entire source audio file from your computer, play it, view its full waveform, and select the part sent to native H3 Reference to Video. Uses ComfyUI's native audio decoder; no additional inference model or pip runtime dependency is required beyond a current working ComfyUI audio installation.

## Install

Put the complete H3AudioController folder in ComfyUI/custom_nodes/. Restart ComfyUI, hard-refresh the browser, and search H3 Audio Controller. Do not install duplicate copies of this pack.

## Wiring

H3 Video Controller actual_duration_seconds → H3 Audio Controller duration (FLOAT input).
H3 Audio Controller audio (AUDIO output) → MiniMax H3 Reference to Video ref_audio_0.

Do not connect frame_count to duration. The sample window is measured in seconds. H3's 5-second request may prepare 124 frames at 24 FPS, so the correct input can be 5.1666667 seconds.

## Using the player

1. Choose Audio File uploads the COMPLETE original file to ComfyUI's input/aman_audio folder. Uploaded files remain available when reopening saved workflows on the same server.
2. audio_file chooses an already uploaded source. The player displays the selected filename and a full-file waveform envelope.
3. Connect duration. With the current H3 controller, the selection duration updates before execution from its timing settings. With other source nodes, the frontend may learn the value only after executing this audio node once.
4. Drag the highlighted selection anywhere on the waveform, or enter start_seconds. End is calculated automatically. Left/right arrow keys nudge Start by 0.1 second; Shift uses 1 second.
5. Play Selection auditions the selected interval. Play Full File auditions from the beginning. Standard audio controls also allow scrubbing and pausing.
6. Zoom Selection enlarges the local timeline view; Full Waveform returns to the entire source.
7. Execution outputs only the chosen interval in ComfyUI AUDIO format: waveform [batch=1, channels, samples] and its original sample_rate.

The approved internal footer follows header color and typography, with left-aligned ♪ Aman Dolorain. Extra package badges are hidden.

## Boundaries and formats

No minutes limit or application-imposed upload-size cap is added by this node. The complete uploaded source is retained, and waveform metadata spans the complete decoded audio. Available server RAM, disk, proxy/server settings and codec support still govern very large files. Native decoding loads the entire source into memory, so an hours-long lossless file is not guaranteed to be lightweight. Metadata requests do not run model inference.

Start is clamped at EOF to the last complete duration-sized selection. If the file is shorter than the connected duration, the node raises a clear error; it does not silently pad, loop, speed up, stretch, normalize, resample or shorten the requested selection. Output duration is rounded to the nearest audio sample.

Source extension support includes WAV, MP3, FLAC, OGG, M4A, AAC, AIFF, Opus and other listed native-decoder containers. Actual decoding depends on ComfyUI/PyAV codec support. Browser playback support is independent: if a codec cannot play in your browser, use WAV or MP3. The full waveform and native output may still work even when the browser cannot play the original container. Browser Play Selection is an audition aid, not a sample-accurate export; backend slicing determines exact output samples.

## Validation

python -m unittest discover -s tests -v
node tests/test_range.mjs
node --input-type=module --check < web/audio.js
node --input-type=module --check < web/author.js

Six Python tests cover sample selection, stereo preservation, output ownership, complete-source waveform envelope, file validation/fingerprints, streamed multipart upload and metadata routes. JavaScript tests cover sample rounding, end clamping and connected H3 duration. Native PyTorch/PyAV decoding is delegated to the official ComfyUI load helper and was not executed in this development runtime. Browser executable was unavailable: actual playback, drag UI, target ComfyUI appearance and end-to-end H3 generation still require live verification.

## GitHub and Registry

Suggested repository name: H3-Audio-Controller. Version: 1.0.0. This new pack includes its own .gitignore and .github/workflows/tests.yml; upload those too. Commit: Release v1.0.0: add H3 Audio Controller.

Before Registry publishing, add the ACTUAL repository URL under [project.urls] Repository in pyproject.toml and confirm PublisherId. No repository URL was guessed and no Registry publish workflow is included yet.

## Research

Native audio decoder and AUDIO shape: https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_audio.py
The pack delegates codec decoding to that implementation rather than adding a conflicting decoder/torch installation.
