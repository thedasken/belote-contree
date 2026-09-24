import {defineConfig,devices} from "@playwright/test";
export default defineConfig({testDir:"./e2e",timeout:30000,use:{baseURL:"http://127.0.0.1:4173"},projects:[{
  name: "chromium",
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: "/usr/bin/chromium-browser",
    },
  },
},{name:"webkit",use:{...devices["Desktop Safari"]}}]});
