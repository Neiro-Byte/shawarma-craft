#!/usr/bin/env python3
"""Render SHAWARMA CRAFT's original Quiet Bazaar loop. Needs NumPy + ffmpeg."""
from pathlib import Path
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio/music'
RATE = 32000
BPM = 72
BEAT = 60 / BPM
BARS = 16
LENGTH = 4 * BARS * BEAT
FRAMES = round(LENGTH * RATE)
RNG = np.random.default_rng(281118)
MIX = np.zeros((FRAMES, 2), dtype=np.float64)


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def add(signal, beat, gain=1., pan=0.):
    """Sum tails across the cycle, so the musical loop retains its natural room tail."""
    start = round(beat * BEAT * RATE) % FRAMES
    data = signal * gain
    stereo = np.column_stack((data * math.sqrt((1-pan)/2), data * math.sqrt((1+pan)/2)))
    count = len(stereo)
    first = min(count, FRAMES-start)
    MIX[start:start+first] += stereo[:first]
    if count > first:
        MIX[:count-first] += stereo[first:]


def time(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def fade(t, attack=.009, release=.09):
    return np.minimum(t/attack, 1.) * np.minimum((t[-1]-t)/release, 1.).clip(0)


def rhodes(note, seconds, velocity=1.):
    t = time(seconds)
    f = hz(note)
    phase = 2*np.pi*f*t + .32*np.exp(-t*2.5)*np.sin(2*np.pi*2*f*t)
    body = np.sin(phase) + .12*np.exp(-t*2)*np.sin(4*np.pi*f*t)
    return body * np.exp(-t*.85) * fade(t, .012, .22) * velocity


def pluck(note, seconds=.95):
    t = time(seconds)
    f = hz(note)
    signal = np.zeros_like(t)
    # Individually damped harmonics give a light, rounded oud-like texture.
    for harmonic, level in [(1,1.), (2,.31), (3,.16), (4,.075), (5,.03), (6,.012)]:
        signal += level*np.sin(2*np.pi*f*harmonic*t + .02*harmonic*np.sin(2*np.pi*4*t)) * np.exp(-t*(2.5+harmonic*.65))
    return signal * fade(t, .005, .10)


def bass(note, seconds=.85):
    t = time(seconds)
    f = hz(note)
    return (np.sin(2*np.pi*f*t)+.10*np.sin(4*np.pi*f*t)) * np.exp(-t*1.8) * fade(t,.018,.12)


def kick():
    t = time(.32)
    phase = 2*np.pi*(49*t + 38*.025*(1-np.exp(-t/.025)))
    return np.sin(phase) * np.exp(-t*16) * fade(t,.002,.03)


def snare():
    t = time(.19)
    noise = RNG.normal(0, 1, len(t))
    noise = (noise + np.roll(noise,1))*.5
    return (.20*noise*np.exp(-t*28)+.17*np.sin(2*np.pi*173*t)*np.exp(-t*30)) * fade(t,.002,.03)


def hat():
    t = time(.075)
    noise = RNG.normal(0,1,len(t))
    noise = noise-np.roll(noise,1)
    return noise * np.exp(-t*74) * fade(t,.002,.018)


# Dm9 -> Gm9 -> Bbmaj9 -> A7(b9), two bars per harmony, twice around.
# The occasional C# resolving to D is the deliberately subtle Eastern inflection.
progression = [
    (38,[50,53,57,60,64]), (38,[50,53,57,60,64]),
    (43,[50,53,58,62,69]), (43,[50,53,58,62,69]),
    (34,[50,53,57,60,62]), (34,[50,53,57,60,62]),
    (33,[49,52,55,58,64]), (33,[49,52,55,58,64]),
] * 2
for bar, (root, chord) in enumerate(progression):
    human = float(RNG.uniform(-.014,.014))
    for i,note in enumerate(chord):
        add(rhodes(note,2.85),bar*4 + .018*i + max(0,human),.042, -.17 + i*.075)
        if bar % 2 == 1:
            add(rhodes(note,1.05),bar*4+2.78+.012*i,.019, -.1+i*.04)
    add(bass(root),bar*4+.025,.14,0)
    add(bass(root, .64),bar*4+2.55,.097,0)
    if bar in [3,7,11,15]:
        add(bass(root+7,.38),bar*4+3.38,.045,.02)
    add(kick(),bar*4,.22,0)
    add(kick(),bar*4+2.52,.15,0)
    if bar % 4 == 2:
        add(kick(),bar*4+3.55,.085,0)
    for backbeat in [1.04,3.04]:
        add(snare(),bar*4+backbeat,.21, .035)
    for eighth in range(8):
        # A lightly swung back half, quiet enough to leave food ASMR in front.
        onset = eighth*.5 + (.065 if eighth%2 else 0)
        add(hat(),bar*4+onset,.011*(.7 if eighth%2 else 1.), -.12 if eighth%2 else .12)

phrases = {
 0:[(.55,69,.075),(1.7,67,.068),(2.8,65,.065)],
 2:[(.65,62,.078),(2.55,65,.060),(3.25,64,.055)],
 4:[(.60,65,.065),(1.85,64,.060),(2.95,62,.072)],
 6:[(.75,64,.062),(2.7,61,.060)],
 7:[(3.30,61,.057),(3.70,62,.065)],
 8:[(.55,69,.075),(1.7,67,.061),(3.0,65,.066)],
 10:[(.75,62,.074),(2.20,65,.057),(3.3,69,.057)],
 12:[(.65,70,.052),(1.80,69,.060),(3.1,65,.060)],
 14:[(.80,64,.060),(2.55,61,.056)],
 15:[(2.8,61,.048),(3.4,62,.062)],
}
for bar, phrase in phrases.items():
    for beat,note,gain in phrase:
        voice = pluck(note)
        add(voice,bar*4+beat,gain,.14)
        add(voice,bar*4+beat+.75,gain*.13,-.17)

# A quiet cyclic room response. No reverb or synthesis runs on the phone.
original = MIX.copy()
for seconds, gain, swap in [(.113,.075,True),(.227,.045,False),(.371,.025,True)]:
    reflected = np.roll(original,round(seconds*RATE),axis=0)
    MIX += reflected[:,::-1] * gain if swap else reflected*gain
# Subtle, band-limited room texture, periodic by construction, with no vinyl pops.
texture = RNG.normal(0,1,FRAMES)
freq = np.fft.rfftfreq(FRAMES,1/RATE)
spectrum = np.fft.rfft(texture)
spectrum *= (freq>100) * np.exp(-freq/1500)
texture = np.fft.irfft(spectrum,n=FRAMES)
texture /= max(float(np.std(texture)),1e-8)
MIX += texture[:,None] * .000035
MIX = np.tanh(MIX*1.12)/1.12
MIX *= .62/max(float(np.max(np.abs(MIX))),1e-9)
assert np.isfinite(MIX).all()
assert np.max(np.abs(MIX)) <= .62001
assert np.max(np.abs(MIX[0]-MIX[-1])) < .012, 'Loop boundary discontinuity'
OUT.mkdir(parents=True,exist_ok=True)
ffmpeg = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'
with tempfile.TemporaryDirectory(prefix='shawarma-lofi-') as temp:
    wav = Path(temp)/'quiet-bazaar.wav'
    with wave.open(str(wav),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE)
        f.writeframes((MIX*32767).astype('<i2').tobytes())
    output = OUT/'quiet-bazaar-v1.mp3'
    subprocess.run([ffmpeg,'-y','-v','error','-i',str(wav),'-af',
      'loudnorm=I=-22:TP=-3:LRA=9,alimiter=limit=0.68:level=false:latency=true',
      '-ar',str(RATE),'-ac','2','-codec:a','libmp3lame','-b:a','96k',
      '-map_metadata','-1',str(output)],check=True)
manifest = {
 'title':'Quiet Bazaar', 'version':1, 'filename':output.name,
 'composition':'Original deterministic procedural composition created for SHAWARMA CRAFT',
 'sources':'No external music recordings, samples, loops, vocals or melodies used',
 'bpm':BPM,'bars':BARS,'meter':'4/4','key':'D minor with harmonic-minor melodic inflections',
 'durationSeconds':LENGTH,'sampleRate':RATE,'channels':2,'bitrate':96000,
 'normalization':'-22 LUFS target, -3 dBTP ceiling; limiter -3.35 dBFS',
 'loop':'Cyclic note/reverb tails summed across 16-bar boundary; encoder adds gapless playback metadata',
 'seed':281118,'bytes':output.stat().st_size,
 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
 'verification':'Numeric checks and FFmpeg measurements; subjective listening not verified',
}
decoded = np.frombuffer(subprocess.check_output([ffmpeg,'-v','error','-i',str(output),'-f','f32le','-']), dtype='<f4').reshape(-1,2)
sample_peak = float(np.max(np.abs(decoded)))
seam = float(np.max(np.abs(decoded[0]-decoded[-1])))
assert sample_peak < 10**(-3/20), 'Encoded output must retain peak headroom'
assert seam < .015, 'Decoded loop boundary discontinuity'
manifest['decodedVerification'] = {'frames':len(decoded),'durationSeconds':len(decoded)/RATE,
 'samplePeakDbFS':float(20*np.log10(sample_peak)),'loopBoundarySampleDelta':seam}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
assert output.stat().st_size < 750000
print(json.dumps(manifest,ensure_ascii=False,indent=2))
