import {
	name,
	version
} from './package.json';

import typescript from "@rollup/plugin-typescript";
import {
	terser
} from "rollup-plugin-terser";
import { copyFileSync } from 'fs';

const d = new Date();
const pad = n => String(n).padStart(2, '0');
const timestamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const outFile = `./build/${name}-${version}-${timestamp}.js`;
const pluginDest = `C:/Users/rjsmi/Documents/OpenRCT2/plugin/${name}.js`;

function copyToPlugin(dest) {
	return {
		name: 'copy-to-plugin',
		writeBundle(options) {
			copyFileSync(options.file, dest);
			console.log(`[copy-to-plugin] → ${dest}`);
		}
	};
}

export default {
	input: "./src/main.ts",
	output: {
		format: "iife",
		file: outFile,
	},
	plugins: [
		typescript(),
		terser({
			format: {
				preamble: `// ${name} v${version}\n// Copyright (c) 2020-2026 Sadret\n// Copyright (c) 2026 RYJASM - Multiplayer Edition`,
			},
		}),
		copyToPlugin(pluginDest),
	],
};
