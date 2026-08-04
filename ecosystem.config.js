// pm2 (Go 版 1.0.0, goja runtime) — 無 require/__dirname/process, 路徑寫字面值
// 註冊: pm2 apply    啟動: pm2 start gameboy-rpg    紀錄: pm2 logs gameboy-rpg
module.exports = {
  apps: [
    {
      name: "gameboy-rpg",
      script: "/Users/shuk/projects/game/gameboy-rpg/scripts/run.sh",
      args: [],
      cwd: "/Users/shuk/projects/game/gameboy-rpg",
      env: {
        APP_ADDR: ":8470",
      },
      out_file: "/Users/shuk/.config/gameboy-rpg/logs/gameboy-rpg.out.log",
      error_file: "/Users/shuk/.config/gameboy-rpg/logs/gameboy-rpg.err.log",
      autorestart: true,
    },
  ],
};
