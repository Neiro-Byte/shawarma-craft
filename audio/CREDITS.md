# ASMR food sound bank — revision 2

The app uses edited food Foley to create close, textured ASMR-style cooking audio. The source authors do not label all of these recordings as ASMR. These are not binaural recordings, and ASMR perception is subjective.

Every source below is CC0 1.0. Commercial use and redistribution are permitted. License: https://creativecommons.org/publicdomain/zero/1.0/

Original public preview recordings were obtained from Freesound on 2026-11-18. Processing happens offline, not on the phone: mono 32 kHz / 80 kbit MP3; 70 Hz high-pass; gentle noise reduction; 14 kHz low-pass; +1.5 dB presence at 2.8 kHz; loudness normalization (-18 to -24 LUFS by role), -3 dBTP ceiling; short fades. No speech, music or chewing is deliberately included. Source and trim details, processing, byte counts and SHA-256 fingerprints are in manifest.json.

| Included clip | Source author | Original / CC0 evidence | Trim, seconds |
|---|---|---|---|
| asmr-v2/cucumber.mp3 | CarikaDarvall | [764468](https://freesound.org/people/CarikaDarvall/sounds/764468/) | 2.22–3.12 |
| asmr-v2/tomato.mp3 | frodeims | [812387](https://freesound.org/people/frodeims/sounds/812387/) | 4.56–5.41 |
| asmr-v2/onion.mp3 | PureAudioNinja | [339050](https://freesound.org/people/PureAudioNinja/sounds/339050/) | 0.10–0.70 |
| asmr-v2/cabbage.mp3 | MessyAcousticApocalypse666 | [594781](https://freesound.org/people/MessyAcousticApocalypse666/sounds/594781/) | 1.42–2.37 |
| asmr-v2/vegetable.mp3 | HenKonen | [757214](https://freesound.org/people/HenKonen/sounds/757214/) | 2.68–3.48 |
| asmr-v2/leaf.mp3 | d.n.audio.uk | [412531](https://freesound.org/people/d.n.audio.uk/sounds/412531/) | 0.18–1.03 |
| asmr-v2/carrot.mp3 | Iman.Media | [850287](https://freesound.org/people/Iman.Media/sounds/850287/) | 1.38–2.18 |
| asmr-v2/meat-cut.mp3 | levypeck | [593682](https://freesound.org/people/levypeck/sounds/593682/) | 4.34–4.82 |
| asmr-v2/meat-land.mp3 | levypeck | [593682](https://freesound.org/people/levypeck/sounds/593682/) | 5.68–6.06 |
| asmr-v2/sauce.mp3 | MyseriA | [237783](https://freesound.org/people/MyseriA/sounds/237783/) | 41.65–43.05 |
| asmr-v2/fries.mp3 | Anthousai | [398764](https://freesound.org/people/Anthousai/sounds/398764/) | 0.00–1.40 |
| asmr-v2/fold.mp3 | Anthousai | [398896](https://freesound.org/people/Anthousai/sounds/398896/) | 6.48–7.58 |
| asmr-v2/bread.mp3 | Anthousai | [398896](https://freesound.org/people/Anthousai/sounds/398896/) | 4.70–5.30 |
| asmr-v2/grill.mp3 | beatmad | [201936](https://freesound.org/people/beatmad/sounds/201936/) | 1.70–4.20 |

Meat clips combine the actual chicken-cutting recording by levypeck with a low-volume layer from [sizzling_frypan.WAV by beatmad](https://freesound.org/people/beatmad/sounds/201936/) (CC0), to suggest cooked crust. The source is sizzling oil, not a dedicated shawarma spit recording.

Mapping: cucumber/pickles → cucumber; tomato → tomato; onion → spring onion; lettuce → lettuce crunch; cabbage → cabbage; carrot → carrot; pepper/jalapeño/mushroom → vegetable chop; chicken/beef → chicken Foley; sauces → ketchup squeeze. Fries/falafel use crushed chips as dry-crunch Foley (not chewing). Bread placement and wrapping use soft paper handling/folding as a Foley substitute, not a recording of actual lavash. Cheese and grains retain procedural effects.

The cacheable sample bank is versioned as asmr-v2, decoded once per sample, and plays through the existing mute/background/overlap controls. There is no looping ambience. While a clip is unavailable, the current action gets the procedural fallback; it is never replayed late.

Auditory balance on actual phones and headphones still needs user listening; the automated checks verify delivery, mapping, timing, file integrity and resource limits.

## ASMR removal cue

`asmr-v2/remove.mp3` uses [Rice Pour by thedapperdan](https://freesound.org/people/thedapperdan/sounds/199930/), CC0 1.0. A 2.90–3.68 s excerpt of real rice being poured from a bag into a plastic bucket suggests transferring the removed filling into a container. This is granular-transfer Foley, not a literal recording of every shawarma ingredient. Mono 32 kHz / 80 kbit MP3; 70 Hz high-pass, gentle noise reduction, -20 LUFS target, -3 dBTP ceiling, short fades. It belongs to effects, not music.
