const updateUrl = process.env.ERA_OPERATOR_UPDATE_URL;

const publish = updateUrl
  ? [
      {
        provider: "generic",
        url: updateUrl
      }
    ]
  : undefined;

export default {
  appId: "com.enterprise.resilience.agent",
  productName: "Enterprise Resilience Agent",
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  files: ["dist/**/*", "electron/**/*", "package.json"],
  directories: {
    output: "release"
  },
  publish,
  generateUpdatesFilesForAllChannels: true,
  linux: {
    target: ["AppImage"],
    category: "Utility"
  },
  mac: {
    target: ["dmg"],
    hardenedRuntime: true
  },
  win: {
    target: ["nsis"]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
};
