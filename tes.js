import { Client } from "ssh2";

const host = "134.209.168.76";
const username = "root";
const oldPassword = "024ad504b2e6642433e46aa62b";
const newPassword = "ayamGoreng1aja";

if (oldPassword.startsWith("ISI_") || newPassword.startsWith("ISI_")) {
  throw new Error("Isi oldPassword dan newPassword di tes.js terlebih dahulu.");
}

const client = new Client();

client
  .on("change password", (message, done) => {
    console.log(message || "Password sementara harus diganti.");
    done(newPassword);
  })
  .on(
    "keyboard-interactive",
    (_name, _instructions, _lang, prompts, finish) => {
      finish(
        prompts.map(({ prompt }) => {
          const normalizedPrompt = prompt.toLowerCase();

          if (
            normalizedPrompt.includes("new") ||
            normalizedPrompt.includes("again") ||
            normalizedPrompt.includes("retype") ||
            normalizedPrompt.includes("repeat")
          ) {
            return newPassword;
          }

          return oldPassword;
        }),
      );
    },
  )
  .on("ready", () => {
    console.log("Login SSH berhasil; membuka TTY untuk mengganti password...");

    client.shell(
      { term: "xterm-color", cols: 120, rows: 30 },
      (error, stream) => {
        if (error) {
          console.error("Shell remote gagal:", error.message);
          client.end();
          return;
        }

        let outputBuffer = "";
        let shellCommandSent = false;

        stream.on("data", (data) => {
          const output = data.toString();
          const prompt = output.toLowerCase();
          outputBuffer = `${outputBuffer}${output}`.slice(-4096);
          process.stdout.write(data);

          if (
            prompt.includes("current password") ||
            prompt.includes("current unix password")
          ) {
            stream.write(`${oldPassword}\n`);
          } else if (
            prompt.includes("new password") &&
            !prompt.includes("retype") &&
            !prompt.includes("again")
          ) {
            stream.write(`${newPassword}\n`);
          } else if (
            prompt.includes("retype") ||
            prompt.includes("again") ||
            prompt.includes("repeat")
          ) {
            stream.write(`${newPassword}\n`);
          } else if (
            prompt.includes("password updated successfully") ||
            prompt.includes("all authentication tokens updated successfully")
          ) {
            if (!shellCommandSent) {
              shellCommandSent = true;
              stream.write("whoami && hostname; exit\n");
            }
          }

          const cleanBuffer = outputBuffer
            .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
            .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");

          if (!shellCommandSent && /root@[^\r\n]+[#\$]\s*$/.test(cleanBuffer)) {
            shellCommandSent = true;
            stream.write("whoami && hostname; exit\n");
          }
        });

        stream.on("close", () => client.end());
      },
    );
  })
  .on("error", (error) => {
    console.error("SSH gagal:", error.message);
  })
  .connect({
    host,
    port: 22,
    username,
    password: oldPassword,
    tryKeyboard: true,
    readyTimeout: 20_000,
  });
