import Formbricks, {
  logout,
  setAppearance,
  setAttribute,
  setAttributes,
  setLanguage,
  setUserId,
  track,
} from "@formbricks/react-native";
import { StatusBar } from "expo-status-bar";
import { type JSX, useState } from "react";
import {
  Appearance,
  Button,
  LogBox,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";

LogBox.ignoreAllLogs();

type SdkConfig = { appUrl: string; workspaceId: string };

// The testIDs are what the Detox golden journey (e2e/golden-journey.e2e.js) drives.
export default function App(): JSX.Element {
  const appTheme = useColorScheme();
  const textColor = appTheme === "dark" ? "#fff" : "#000";

  // Prefilled from apps/playground/.env; the SDK is set up only when "Set up" is pressed, so the
  // E2E journey can point the app at a server whose URL is known only at run time.
  const [appUrl, setAppUrl] = useState(process.env.EXPO_PUBLIC_APP_URL ?? "");
  const [workspaceId, setWorkspaceId] = useState(
    process.env.EXPO_PUBLIC_FORMBRICKS_WORKSPACE_ID ?? "",
  );
  const [sdkConfig, setSdkConfig] = useState<SdkConfig | null>(null);
  const [userId, setUserIdInput] = useState("");
  const [attributeKey, setAttributeKey] = useState("plan");
  const [attributeValue, setAttributeValue] = useState("pro");
  const [action, setAction] = useState("qa-action");
  const [status, setStatus] = useState("Not set up");

  // The status line tells a person (and the E2E journey) that a call has returned.
  const run = (label: string, call: () => Promise<void>): void => {
    call()
      .then(() => setStatus(`${label} done`))
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console -- logging is allowed in demo apps
        console.error(`Error in ${label}:`, error);
        setStatus(`${label} failed`);
      });
  };

  const inputStyle = [styles.input, { color: textColor }];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: appTheme === "dark" ? "#000" : "#fff" },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="playground-scroll"
      >
        <Text style={{ color: textColor }}>
          Formbricks React Native SDK Demo
        </Text>

        <Text style={{ color: textColor }} testID="status">
          {status}
        </Text>

        <TextInput
          accessibilityLabel="App URL"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setAppUrl}
          placeholder="App URL"
          style={inputStyle}
          testID="app-url-input"
          value={appUrl}
        />
        <TextInput
          accessibilityLabel="Workspace ID"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setWorkspaceId}
          placeholder="Workspace ID"
          style={inputStyle}
          testID="workspace-id-input"
          value={workspaceId}
        />
        <Button
          title="Set up"
          testID="setup-button"
          onPress={() => {
            const config = {
              appUrl: appUrl.trim(),
              workspaceId: workspaceId.trim(),
            };
            setSdkConfig(config);
            setStatus(`Set up with ${config.appUrl} ${config.workspaceId}`);
          }}
        />

        <TextInput
          accessibilityLabel="User ID"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setUserIdInput}
          placeholder="User ID"
          style={inputStyle}
          testID="user-id-input"
          value={userId}
        />
        <Button
          title="Set user ID"
          testID="set-user-id-button"
          onPress={() => run(`setUserId(${userId})`, () => setUserId(userId))}
        />

        <View style={styles.row}>
          <TextInput
            accessibilityLabel="Attribute key"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAttributeKey}
            style={[inputStyle, styles.half]}
            testID="attribute-key-input"
            value={attributeKey}
          />
          <TextInput
            accessibilityLabel="Attribute value"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAttributeValue}
            style={[inputStyle, styles.half]}
            testID="attribute-value-input"
            value={attributeValue}
          />
        </View>
        <Button
          title="Set attribute"
          testID="set-attribute-button"
          onPress={() =>
            run(`setAttribute(${attributeKey}=${attributeValue})`, () =>
              setAttribute(attributeKey, attributeValue),
            )
          }
        />

        <TextInput
          accessibilityLabel="Action"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setAction}
          style={inputStyle}
          testID="action-input"
          value={action}
        />
        <Button
          title="Track action"
          testID="track-action-button"
          onPress={() => run(`track(${action})`, () => track(action))}
        />

        <Button
          title="Trigger Code Action"
          onPress={() => run("track(code)", () => track("code"))}
        />

        <Button
          title="Set User Attributes (multiple)"
          onPress={() =>
            run("setAttributes", () =>
              setAttributes({
                testAttr: "attr-test",
                testAttr2: "attr-test-2",
                testAttr3: "attr-test-3",
                testAttr4: "attr-test-4",
              }),
            )
          }
        />

        <View style={styles.row}>
          <Button title="Light" onPress={() => setAppearance("light")} />
          <Button title="Dark" onPress={() => setAppearance("dark")} />
          <Button title="System" onPress={() => setAppearance("system")} />
        </View>

        <View style={styles.row}>
          <Button
            title="App light"
            onPress={() => Appearance.setColorScheme("light")}
          />
          <Button
            title="App dark"
            onPress={() => Appearance.setColorScheme("dark")}
          />
        </View>

        <Button
          title="Logout"
          testID="logout-button"
          onPress={() => run("logout", logout)}
        />

        <Button
          title="Set Language (de)"
          onPress={() => run("setLanguage(de)", () => setLanguage("de"))}
        />
      </ScrollView>

      <StatusBar style="auto" />

      {sdkConfig ? (
        <Formbricks
          appUrl={sdkConfig.appUrl}
          workspaceId={sdkConfig.workspaceId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  input: {
    borderColor: "#999",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  half: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
});
