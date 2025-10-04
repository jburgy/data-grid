import { defineConfig } from "vite";
import anywidget from "@anywidget/vite";

export default defineConfig({
	build: {
		outDir: "data_grid/static",
		lib: {
			entry: ["js/widget.js"],
			formats: ["es"],
		},
	},
    plugins: [anywidget()],
});