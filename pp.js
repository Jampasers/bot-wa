import { Client } from "ssh2";
import { createInterface } from "node:readline/promises";

const host = "159.65.183.204";
const oldPassword = "87a8098152acaa81682abe6c44";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const newPassword = await rl.question("Password baru: ");
rl.close();

const client = new Client();

client
  .on("change password", (message, done) => {
    console.log(message || "Password wajib diganti.");
    done(newPassword);
  })
  .on("keyboard-interactive", (name, instructions, lang, prompts, finish) => {
    const answers = prompts.map(({ prompt }) => {
      const text = prompt.toLowerCase();

      if (
        text.includes("new") ||
        text.includes("again") ||
        text.includes("retype") ||
        text.includes("repeat")
      ) {
        return newPassword;
      }

      return oldPassword;
    });

    finish(answers);
  })
  .on("ready", () => {
    console.log("Login berhasil dan password sudah diperbarui.");

    client.exec("whoami && hostname", (err, stream) => {
      if (err) throw err;

      stream
        .on("data", (data) => process.stdout.write(data))
        .stderr.on("data", (data) => process.stderr.write(data))
        .on("close", () => client.end());
    });
  })
  .on("error", (err) => {
    console.error("SSH gagal:", err.message);
  })
  .connect({
    host,
    port: 22,
    username: "root",
    password: oldPassword,
    tryKeyboard: true,
    readyTimeout: 20000,
  });
