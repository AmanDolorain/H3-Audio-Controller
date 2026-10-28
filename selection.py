"""Sample-accurate range selection shared by execution and preview metadata."""
import math

def selection_range(sample_count, sample_rate, start_seconds, duration):
    if not isinstance(sample_rate, int) or sample_rate <= 0 or sample_count <= 0:
        raise ValueError('The file has no valid audio samples.')
    for value in (start_seconds, duration):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError('Start and duration must be finite numbers.')
    if start_seconds < 0 or duration <= 0:
        raise ValueError('Start must be nonnegative and duration must be positive.')
    count = max(1, round(duration * sample_rate))
    if count > sample_count:
        raise ValueError('Audio is shorter than the requested duration. Choose a longer file or reduce video duration.')
    start = min(round(start_seconds * sample_rate), sample_count - count)
    return start, start + count
