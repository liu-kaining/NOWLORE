import type { AppConfig } from "../config/env.js";
import { createAiProvider, type AiProvider } from "../ai/index.js";
import { createObjectPublisher, type ObjectPublisher } from "../assets/publisher.js";
import { AssetService } from "../assets/service.js";
import { createChainAdapter, type ChainAdapter } from "../chain/index.js";
import { DiscoveryService } from "../pipeline/discovery.js";
import { ForgeService } from "../pipeline/forge.js";
import { OracleService } from "../pipeline/oracle.js";
import { createSources, type SourceAdapter } from "../sources/index.js";
import { createStore, type Store } from "../storage/index.js";
import { systemClock, type Clock } from "../lib/time.js";
import { LaunchService } from "../services/launches.js";
import { ManualSignalService } from "../services/manual.js";
import { PipelineService } from "../services/pipeline.js";
import { ProjectService } from "../services/projects.js";

export interface AppOverrides {
  store?: Store;
  ai?: AiProvider;
  sources?: SourceAdapter[];
  publisher?: ObjectPublisher;
  chain?: ChainAdapter;
  clock?: Clock;
}

export async function createContext(config: AppConfig, overrides: AppOverrides = {}) {
  const clock = overrides.clock ?? systemClock;
  const store = overrides.store ?? await createStore(config);
  const ai = overrides.ai ?? createAiProvider(config);
  const sources = overrides.sources ?? createSources(config);
  const publisher = overrides.publisher ?? createObjectPublisher(config);
  const chain = overrides.chain ?? await createChainAdapter(config);
  const discovery = new DiscoveryService(store, sources, clock);
  const oracle = new OracleService(store, ai, clock);
  const forge = new ForgeService(store, ai, config.chain.network, clock);
  return {
    config, clock, store, ai, sources, publisher, chain,
    discovery, oracle, forge,
    projects: new ProjectService(store, clock),
    assets: new AssetService(store, publisher, config.publicBaseUrl, clock),
    launches: new LaunchService(store, chain, config.chain.mainnetEnabled, clock),
    manual: new ManualSignalService(store, clock),
    pipeline: new PipelineService(store, discovery, oracle, forge, config),
  };
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
