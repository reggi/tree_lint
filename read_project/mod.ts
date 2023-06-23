import { walkSync } from 'https://deno.land/std@0.164.0/fs/mod.ts';
import { parseImportsSync } from '../parse_imports/mod.ts';
import path from 'node:path'

const filesProjectName = (filePath: string) => {
  return path.basename(path.dirname(filePath))
}

function without<T>(...values: T[]): (element: T) => boolean {
  return (element: T) => !values.includes(element);
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function rmFirst<T>(arr: T[]): T[] {
  if (arr.length === 0) return arr
  return arr.slice(1)
}

type ParseImports = (filePath: string) => string[]

function walkDirectoryForTypeScriptFiles(directory: string) {
  const tree: string[] = [];
  for (const entry of walkSync(directory)) {
    if (entry.isFile && entry.name.endsWith('.ts')) {
      tree.push(entry.path);
    }
  }
  return tree;
}

function createTreeFromFiles(files: string[], parseImports: ParseImports = parseImportsSync) {
  const tree: Record<string, string[]> = {};
  function processFile(filePath: string) {
    const deps = parseImports(filePath)
    const project = filesProjectName(filePath)
    // console.log({ filePath, project, deps })
    tree[project] = unique([
      ...(tree[project] || []),
      ...deps.map(filesProjectName).filter(without(project))
    ]).filter(v => !['.', '..'].includes(v))
  }
  files.forEach(processFile)
  return tree
}

type TreeNode = { [key: string]: TreeNode };

function createObject(input: string[][]): TreeNode {
  const root: TreeNode = {};
  for (const path of input) {
    let node = root;
    for (const part of path) {
      if (!(part in node)) {
        node[part] = {};
      }

      node = node[part];
    }
  }
  return root;
}

// return rmFirst(p.split(path.sep)).join(path.sep)
const pathRemoveRoot = (filePath: string, dir: string): string => { 
  const normalizedPath = filePath.split(path.sep)
  const dirIndex = normalizedPath.indexOf(dir)
  if (dirIndex > -1) return normalizedPath.slice(dirIndex + 1).join(path.sep)
  return filePath;
}

function readDirectory(directory: string) {
  const paths = walkDirectoryForTypeScriptFiles(directory)
  return paths.map(v => path.dirname(v))
}

/** given a list of paths returns all  */
const findDuplicateDirs = (dirs: string[][]) => {
  const dirMap: Record<string, number[]> = {}
  dirs.forEach((paths) => {
    paths.forEach((path, ix) => {
      if (!dirMap[path]) dirMap[path] = []
      dirMap[path].push(ix)
    })
  })
  const list = Object.fromEntries(Object
    .entries(dirMap)
    .map(([k, levels]) => ([k, unique(levels)] as [string, number[]])))
  const duplicateDirs: string[] = Object.entries(list).filter(v => v[1].length > 1).map(v => v[0])
  return duplicateDirs
}

type Sortable = { [key: string]: Sortable } | Sortable[] | null | string | number | boolean;

export function sortObjectKeys(obj: Sortable): Sortable {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  return sortedKeys.reduce((sortedObj: { [key: string]: Sortable }, key: string) => {
    sortedObj[key] = sortObjectKeys(obj[key]);
    return sortedObj;
  }, {});
}

// .map(pathRemoveRoot)
export function directoryObject(directory: string) {
  const basename = path.basename(directory)
  const paths = readDirectory(directory).map(p => pathRemoveRoot(p, basename))
  const dirs = paths.map(v => v.split(path.sep))
  const dupes = findDuplicateDirs(dirs)
  const object = createObject(dirs)
  if (dupes.length) throw new Error('Duplicate directories found: ' + dupes.join(', '))
  return object
}

export function readProject(directory: string, parseImports: ParseImports = parseImportsSync): Record<string, string[]> {
  const files = walkDirectoryForTypeScriptFiles(directory)
  return createTreeFromFiles(files, parseImports)
} 