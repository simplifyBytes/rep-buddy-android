# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Android APK

`rep-buddy-debug.apk` is a debug build that bundles the whole web app (works with no network for the UI; sign-in and data still need Supabase). Google sign-in opens the system browser and returns through the `lovable://oauth-callback` deep link.

Rebuild it (needs bun, JDK 21, Android SDK):

```sh
bun install
bun run vite build --config vite.capacitor.config.ts
cd android-app && npm install
rm -rf www/assets && cp -r ../dist/client/. www/ && mv -f www/_shell.html www/index.html
npx cap sync android
cd android && JAVA_HOME=/path/to/jdk-21 ./gradlew assembleDebug
# -> android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

`rep-buddy-release.aab` is the Play Store upload bundle (signed with a local upload key that is not in this repo). Rebuild with `./gradlew bundleRelease` after placing `keystore.properties` and the `.jks` in `android-app/android/`.
