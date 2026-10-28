"""H3 Audio Controller. Author: Aman Dolorain."""
import asyncio
import hashlib
from pathlib import Path
import uuid
import folder_paths
from .selection import selection_range

__version__ = '1.0.0'
__author__ = 'Aman Dolorain'
WEB_DIRECTORY = './web'
EXTENSIONS = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.aiff', '.aif', '.opus', '.wma', '.mp4', '.webm'}


def resolve_audio(name):
    root = Path(folder_paths.get_input_directory()).resolve()
    path = (root / name).resolve()
    if not path.is_relative_to(root) or path.suffix.lower() not in EXTENSIONS or not path.is_file():
        raise ValueError('Choose an existing supported audio file from the ComfyUI input directory.')
    return path


def load_source(name):
    from comfy_extras.nodes_audio import load
    waveform, sample_rate = load(str(resolve_audio(name)))
    if waveform.ndim != 2 or waveform.shape[-1] == 0:
        raise ValueError('The source contains no decodable audio.')
    return waveform, int(sample_rate)


def audio_info(name):
    waveform, sr = load_source(name)
    count = int(waveform.shape[-1])
    # A bounded-size envelope for the complete file, never a truncated source.
    bins = min(1200, count)
    peaks = [float(waveform[:, i*count//bins:(i+1)*count//bins].abs().max().item()) for i in range(bins)]
    return {'duration': count / sr, 'sample_rate': sr, 'sample_count': count,
            'channels': int(waveform.shape[0]), 'peaks': peaks}


class LoadAudioController:
    CATEGORY = 'Aman Dolorain/Audio'
    DESCRIPTION = ('Load a complete audio file, audition it and drag a fixed-duration waveform selection. '
                   'Connect actual_duration_seconds to duration; output only the chosen AUDIO segment. '
                   'Source audio is not stretched, looped or padded.')
    FUNCTION = 'select_audio'
    RETURN_TYPES = ('AUDIO',)
    RETURN_NAMES = ('audio',)

    @classmethod
    def INPUT_TYPES(cls):
        root = Path(folder_paths.get_input_directory())
        files = sorted(p.relative_to(root).as_posix() for p in root.rglob('*')
                       if p.is_file() and p.suffix.lower() in EXTENSIONS) if root.exists() else []
        return {'required': {
            'duration': ('FLOAT', {'forceInput': True, 'default': 5.0,
                'tooltip': 'Connect H3 actual_duration_seconds here, not frame_count.'}),
            'audio_file': (files or [''], {'tooltip': 'Full uploaded source file.'}),
            'start_seconds': ('FLOAT', {'default': 0.0, 'min': 0.0, 'max': 1e12, 'step': 0.01,
                'tooltip': 'Start time in seconds. End = start + connected duration. Near EOF start clamps to the last full window.'}),
        }}

    def select_audio(self, duration, audio_file, start_seconds=0.0):
        waveform, sr = load_source(audio_file)
        start, end = selection_range(int(waveform.shape[-1]), sr, start_seconds, duration)
        selected = waveform[:, start:end].clone().unsqueeze(0)
        audio = {'waveform': selected, 'sample_rate': sr}
        return {'ui': {'selection': [{'start': start/sr, 'end': end/sr, 'duration': (end-start)/sr,
                                     'source_duration': waveform.shape[-1]/sr, 'file': audio_file}]},
                'result': (audio,)}

    @classmethod
    def VALIDATE_INPUTS(cls, audio_file):
        try:
            resolve_audio(audio_file)
            return True
        except ValueError as error:
            return str(error)

    @classmethod
    def IS_CHANGED(cls, audio_file, **kwargs):
        try:
            path = resolve_audio(audio_file)
            digest = hashlib.sha256()
            with path.open('rb') as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
            return digest.hexdigest()
        except (ValueError, OSError):
            return float('nan')


NODE_CLASS_MAPPINGS = {'H3AudioController': LoadAudioController}
NODE_DISPLAY_NAME_MAPPINGS = {'H3AudioController': 'H3 Audio Controller'}


def register_routes():
    from aiohttp import web
    from server import PromptServer
    routes = PromptServer.instance.routes

    @routes.post('/aman_audio/upload')
    async def upload(request):
        reader = await request.multipart()
        part = await reader.next()
        if part is None or part.name != 'audio' or not part.filename:
            return web.json_response({'error': 'Choose an audio file.'}, status=400)
        original = Path(part.filename.replace('\\', '/')).name
        suffix = Path(original).suffix.lower()
        if suffix not in EXTENSIONS:
            return web.json_response({'error': 'Unsupported audio extension.'}, status=400)
        directory = Path(folder_paths.get_input_directory()) / 'aman_audio'
        directory.mkdir(parents=True, exist_ok=True)
        filename = uuid.uuid4().hex + '_' + Path(original).stem[:170] + suffix
        path = directory / filename
        try:
            # Stream the entire upload to disk; no minutes/file-size limit is imposed by this node.
            with path.open('xb') as destination:
                while True:
                    chunk = await part.read_chunk(1024 * 1024)
                    if not chunk:
                        break
                    destination.write(chunk)
            return web.json_response({'file': 'aman_audio/' + filename, 'name': original})
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    @routes.get('/aman_audio/info')
    async def info(request):
        try:
            value = await asyncio.to_thread(audio_info, request.query.get('file', ''))
            return web.json_response(value)
        except (ValueError, OSError, RuntimeError) as error:
            return web.json_response({'error': str(error)}, status=400)

register_routes()
