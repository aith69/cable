# Third-party software

vWire itself is released under the MIT License (see `LICENSE`).
It includes or depends on the following components.

| Component | Use | License |
|---|---|---|
| [ws](https://github.com/websockets/ws) | WebSocket server (runtime dependency, installed by npm) | MIT |
| [qrcodejs](https://github.com/davidshimjs/qrcodejs) | QR code generation, `public/vendor/qrcode.min.js` | MIT |
| [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) | Title font, `public/fonts/` (license text: `public/fonts/LICENSE-*.txt`) | SIL OFL 1.1 |
| [Less](https://lesscss.org) | Stylesheet compiler (development only) | Apache-2.0 |

The title font can be changed with `font.config.json` and `npm run font`.
Fonts downloaded that way keep their own license file in `public/fonts/`.

## qrcodejs

qrcodejs is built on the "QRCode for Javascript" library by d-project.com (http://www.d-project.com/), as stated in the header of its source file. The license below is the one shipped with qrcodejs.

```
The MIT License (MIT)
---------------------
Copyright (c) 2012 davidshimjs

Permission is hereby granted, free of charge,
to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
