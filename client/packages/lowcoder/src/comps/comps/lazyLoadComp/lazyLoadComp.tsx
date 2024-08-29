import { default as Skeleton } from "antd/es/skeleton";
import { simpleMultiComp } from "comps/generators";
import { withExposingConfigs } from "comps/generators/withExposing";
import { GreyTextColor } from "constants/style";
import log from "loglevel";
import { Comp, CompAction, CompConstructor, CompParams, customAction, isCustomAction } from "lowcoder-core1";
import { WhiteLoading } from "lowcoder-design1";
import { useState } from "react";
import { useMount } from "react-use";
import styled from "styled-components";
import { RemoteCompInfo, RemoteCompLoader } from "types/remoteComp";
import { withErrorBoundary } from "comps/generators/withErrorBoundary";

const ViewError = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: white;
  height: 100%;
  color: ${GreyTextColor};
  border-radius: 4px;
  padding: 24px;
`;

const ViewLoadingWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: white;
  height: 100%;
`;

function ViewLoading(props: { padding?: number }) {
  return (
    <ViewLoadingWrapper style={{ padding: props.padding }}>
      <Skeleton active />
    </ViewLoadingWrapper>
  );
}

export interface LazyCompReadyAction {
  type: "LazyCompReady";
  comp: Comp;
}

interface LazyCompViewProps {
  loadComp: () => Promise<void>;
  loadingElement?: () => React.ReactNode;
  errorElement?: (error: any) => React.ReactNode;
}

function LazyCompView(props: React.PropsWithChildren<LazyCompViewProps>) {
  const { loadComp, loadingElement, errorElement } = props;
  const [error, setError] = useState<any>("");

  useMount(() => {
    setError("");
    loadComp().catch((e) => {
      setError(String(e));
    });
  });

  if (error) {
    if (errorElement) {
      return <>{errorElement(error)}</>;
    }
    return (
      <ViewError>
        <div>{error}</div>
      </ViewError>
    );
  }

  if (loadingElement) {
    return <ViewLoadingWrapper>{loadingElement()}</ViewLoadingWrapper>;
  }

  return (
    <ViewLoadingWrapper>
      <WhiteLoading />
    </ViewLoadingWrapper>
  );
}

export type LazyloadCompLoader<T = RemoteCompInfo> = () => Promise<CompConstructor | null>;

export function lazyLoadComp(
  compName?: string,
  compPath?: string,
  loader?: LazyloadCompLoader,
  loadingElement?: () => React.ReactNode
) {
  class LazyLoadComp extends simpleMultiComp({}) {
    compValue: any;
    compName = compName;
    compPath = compPath;
    constructor(params: CompParams<any>) {
      super(params);
      this.compValue = params.value;
    }

    private async load() {
      if (!compPath) {
        return;
      }
      let LazyExportedComp;
      if (!loader) {
        const module = await import(`../../${compPath}.tsx`);
        LazyExportedComp = module[compName!];
      } else {
        LazyExportedComp = await loader();
      }
      if (!LazyExportedComp) {
        log.error("loader not found, lazy load info:", compPath);
        return;
      }

      const params: CompParams<any> = {
        dispatch: this.dispatch,
      };

      if (this.compValue) {
        params.value = this.compValue;
      }
      const LazyCompWithErrorBound = withErrorBoundary(LazyExportedComp);
      this.dispatch(
        customAction<LazyCompReadyAction>(
          {
            type: "LazyCompReady",
            comp: new LazyCompWithErrorBound(params),
          },
          false
        )
      );
    }

    getView() {
      // const key = `${remoteInfo?.packageName}-${remoteInfo?.packageVersion}-${remoteInfo?.compName}`;
      const key = `${compName}`;
      return (
        <LazyCompView key={key} loadComp={() => this.load()} loadingElement={loadingElement} />
      );
    }

    getPropertyView() {
      return <ViewLoading padding={16} />;
    }

    reduce(action: CompAction<any>): this {
      if (isCustomAction<LazyCompReadyAction>(action, "LazyCompReady")) {
        // use real remote comp instance to replace RemoteCompLoader
        return action.value.comp as this;
      }
      return super.reduce(action);
    }

    autoHeight(): boolean {
      return false;
    }

    toJsonValue() {
      return this.compValue;
    }
  }

  return withExposingConfigs(LazyLoadComp, []);
}