// pm2 (Go 版 1.0.0, goja runtime) — 無 require/__dirname/process, 路徑寫字面值
// 註冊: pm2 apply    啟動: pm2 start game1    紀錄: pm2 logs game1
module.exports = {
  apps: [
    {
      name: "game1",
      script: "/Users/shuk/projects/game/game1/run.sh",
      args: [],
      cwd: "/Users/shuk/projects/game/game1",
      env: {
        APP_ADDR: ":8470",
      },
      out_file: "/Users/shuk/.config/game1/logs/game1.out.log",
      error_file: "/Users/shuk/.config/game1/logs/game1.err.log",
      autorestart: true,
    },
  ],
};
