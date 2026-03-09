import { nanoid } from 'nanoid';
import type { EmailComponent } from '../types/email';

/** 克隆结果：包含克隆后的组件树和路径→ID映射 */
export interface CloneResult {
  cloned: EmailComponent;
  /** key 为 "childIdx.childIdx..." 格式的路径字符串，value 为新生成的 ID */
  pathToIdMap: Record<string, string>;
}

/**
 * 深拷贝一个 EmailComponent 树，为每个节点重新生成 ID。
 * 用于将复合组件添加到模板时产生独立副本。
 */
export function deepCloneWithNewIds(component: EmailComponent): EmailComponent {
  return deepCloneWithMapping(component, []).cloned;
}

/**
 * 深拷贝并同时建立 pathToIdMap，供业务封装模式绑定解析使用。
 * path 格式：根节点为 ""，子节点为 "0"、"0.1"、"1.0.2" 等。
 */
export function deepCloneWithMapping(
  component: EmailComponent,
  currentPath: number[]
): CloneResult {
  const pathToIdMap: Record<string, string> = {};
  const newId = nanoid();
  const pathKey = currentPath.join('.');

  // 根节点路径为 ""
  pathToIdMap[pathKey] = newId;

  const cloned: EmailComponent = {
    ...component,
    id: newId,
    wrapperStyle: { ...component.wrapperStyle },
    props: { ...component.props },
  };

  // 不复制 compositeInstance（插入时由调用方决定是否挂载）
  if ('compositeInstance' in cloned) {
    delete cloned.compositeInstance;
  }

  if (component.children) {
    cloned.children = component.children.map((child, idx) => {
      const childResult = deepCloneWithMapping(child, [...currentPath, idx]);
      Object.assign(pathToIdMap, childResult.pathToIdMap);
      return childResult.cloned;
    });
  }

  return { cloned, pathToIdMap };
}
