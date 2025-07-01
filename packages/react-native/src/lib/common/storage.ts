import AsyncStorageModule from "@react-native-async-storage/async-storage";

const AsyncStorage =
  // @ts-expect-error: Some bundlers put the module on .default
  AsyncStorageModule.default ?? AsyncStorageModule;

export { AsyncStorage };
