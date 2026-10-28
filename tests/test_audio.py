import importlib.util
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
TEMP=tempfile.TemporaryDirectory()
from aiohttp import web
routes=web.RouteTableDef()
sys.modules['folder_paths']=types.SimpleNamespace(get_input_directory=lambda:TEMP.name)
sys.modules['server']=types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes)))
spec=importlib.util.spec_from_file_location('test_audio_pack',ROOT/'__init__.py',submodule_search_locations=[str(ROOT)])
module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
from test_audio_pack.selection import selection_range

class Wave:
    def __init__(self,array):self.array=np.asarray(array);self.shape=self.array.shape;self.ndim=self.array.ndim
    def __getitem__(self,key):return Wave(self.array[key])
    def clone(self):return Wave(self.array.copy())
    def unsqueeze(self,axis):return Wave(np.expand_dims(self.array,axis))
    def abs(self):return Wave(np.abs(self.array))
    def max(self):return self.array.max()

class AudioTests(unittest.TestCase):
    def test_range_and_eof_and_no_silent_padding(self):
        self.assertEqual(selection_range(480000,48000,2,5),(96000,336000))
        self.assertEqual(selection_range(480000,48000,9,5),(240000,480000))
        self.assertEqual(selection_range(10,10,0,1),(0,10))
        for start,duration in ((-1,1),(0,0),(float('nan'),1),(0,float('inf')),(0,11)):
            with self.subTest(start=start,duration=duration),self.assertRaises(ValueError):selection_range(100,10,start,duration)

    def test_output_samples_channels_and_independent_storage(self):
        original=Wave(np.arange(200).reshape(2,100))
        with patch.object(module,'load_source',return_value=(original,10)):
            value=module.LoadAudioController().select_audio(3,'source.wav',2)
        audio=value['result'][0]
        np.testing.assert_array_equal(audio['waveform'].array,original.array[:,20:50][None,:,:])
        self.assertEqual(audio['waveform'].shape,(1,2,30));self.assertEqual(audio['sample_rate'],10)
        self.assertFalse(np.shares_memory(audio['waveform'].array,original.array))
        self.assertEqual(value['ui']['selection'][0]['end'],5)

    def test_full_source_waveform_envelope_has_bounded_size(self):
        wave=Wave(np.zeros((2,100000)));wave.array[1,-1]=.75
        with patch.object(module,'load_source',return_value=(wave,100)):
            info=module.audio_info('long.wav')
        self.assertEqual(info['duration'],1000);self.assertEqual(info['channels'],2)
        self.assertEqual(len(info['peaks']),1200);self.assertEqual(info['peaks'][-1],.75)

    def test_schema_and_input_paths(self):
        fields=module.LoadAudioController.INPUT_TYPES()['required']
        self.assertTrue(fields['duration'][1]['forceInput'])
        self.assertEqual(module.LoadAudioController.RETURN_TYPES,('AUDIO',))
        p=pathlib.Path(TEMP.name)/'song.wav';p.write_bytes(b'file')
        self.assertEqual(module.resolve_audio('song.wav'),p)
        for name in ('../escape.wav','/etc/passwd','missing.wav'):
            with self.assertRaises(ValueError):module.resolve_audio(name)
        self.assertIs(module.LoadAudioController.VALIDATE_INPUTS('song.wav'),True)
        before=module.LoadAudioController.IS_CHANGED('song.wav');p.write_bytes(b'changed')
        self.assertNotEqual(before,module.LoadAudioController.IS_CHANGED('song.wav'))

class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp.test_utils import TestClient,TestServer
        self.client=TestClient(TestServer(web.Application()));self.client.server.app.add_routes(routes)
        await self.client.start_server()
    async def asyncTearDown(self):await self.client.close()
    async def test_complete_upload_and_info(self):
        from aiohttp import FormData
        data=FormData();payload=b'original source bytes'*200000
        data.add_field('audio',payload,filename='source.wav',content_type='audio/wav')
        response=await self.client.post('/aman_audio/upload',data=data)
        self.assertEqual(response.status,200);saved=await response.json()
        self.assertEqual(module.resolve_audio(saved['file']).read_bytes(),payload)
        with patch.object(module,'audio_info',return_value={'duration':60,'peaks':[.1]}):
            response=await self.client.get('/aman_audio/info',params={'file':saved['file']})
            self.assertEqual(response.status,200);self.assertEqual((await response.json())['duration'],60)
    async def test_rejects_unsupported_upload(self):
        from aiohttp import FormData
        data=FormData();data.add_field('audio',b'x',filename='bad.exe')
        response=await self.client.post('/aman_audio/upload',data=data)
        self.assertEqual(response.status,400)

if __name__=='__main__':unittest.main()
