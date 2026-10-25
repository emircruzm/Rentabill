export interface AppLifecycleService {
  onBackButton(handler: () => void): Promise<() => void>;
}
