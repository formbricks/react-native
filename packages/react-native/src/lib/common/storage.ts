import AsyncStorageModule, {
  type AsyncStorageStatic,
} from "@react-native-async-storage/async-storage";

type AsyncStorageModuleWithDefault = AsyncStorageStatic & {
  default?: AsyncStorageStatic;
};

const asyncStorageModule = AsyncStorageModule as AsyncStorageModuleWithDefault;

const AsyncStorage: AsyncStorageStatic =
  asyncStorageModule.default ?? asyncStorageModule;

export { AsyncStorage };
