import * as path from 'path';

export type ContentType = 'gif' | 'jpeg' | 'pdf' | 'png' | 'text';

interface FileMeta {
  width?: number;
  height?: number;
  size: number;
}

export interface FileObject {
  mimetype: string;
  description: string | null;
  key: string;
  localpath: string | null;
  meta: FileMeta;
}

export interface FileJson {
  objects: FileObject[];
}

export interface S3Object {
  key: string;
  local: string | null;
  size: number;
}

export interface FindOption {
  maxSize?: number; // 指定されたサイズ以下のobjectを探す
  minSize?: number; // 指定されたサイズ以上のobjectを探す
  local?: boolean; // trueの時、リポジトリに含まれるファイルを返す
  filter?: (fileObject: FileObject) => boolean;
}

const dataRoot = path.join(__dirname, 'data');
const fileJson: FileJson = require(path.join(dataRoot, 'index.json')); // eslint-disable-line @typescript-eslint/no-var-requires

function typeToMimeType(type: ContentType): string {
  switch (type) {
    case 'gif': return 'image/gif';
    case 'jpeg': return 'image/jpeg';
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'text': return 'text/plain';
  }
}

export function findS3Object(type: ContentType, option: FindOption = {}): S3Object {
  const fileObjects = fileJson.objects;

  for (let i = 0; i < fileObjects.length; i++) {
    const fileObject = fileObjects[i];

    if (fileObject.mimetype !== typeToMimeType(type)) { continue; }

    const { key, localpath, meta: { size } } = fileObject;

    if (option.filter && !option.filter(fileObject)) { continue; }
    // サイズのチェック
    if (size < (option.minSize || 0)) { continue; }
    if ('maxSize' in option && size > (option.maxSize || 0)) { continue; }

    // localのチェック
    if ('local' in option && (localpath !== null) !== option.local) { continue; }

    return {
      key,
      local: localpath ? path.join(dataRoot, localpath) : null,
      size,
    };
  }

  throw new Error("S3Object Not Found");
}
