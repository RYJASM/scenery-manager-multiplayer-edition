import {
	name,
	version
} from './package.json';
import typescript from "@rollup/plugin-typescript";
import { copyFileSync } from 'fs';

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
		file: `./build/${name}-develop.js`,
		banner: `// ${name} v${version} (develop)`,
	},
	plugins: [
		typescript(),
		copyToPlugin(pluginDest),
	],
};
