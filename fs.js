import fs from 'node:fs/promises';
import nodePath from 'node:path';

const RUNTIME_BROWSER = 0;
const RUNTIME_NODE = 1;
const RUNTIME_DENO = 2;
const RUNTIME_BUN = 3;

const runtime = detectRuntime();

class File {
  constructor(f, start, end) {
    this._file = f;
    this._start = start;
    this._end = end;
    this._size = end - start;
  }

  get size() {
    return this._size;
  }

  stream() {
    throw new Error("Must implement stream()");
  }

  slice() {
    throw new Error("Must implement slice()");
  }
}

class DirectoryTree {
  constructor(rootPath) {
    this._rootPath = rootPath;
  }

  /**
   * @returns {Promise<File>}
   */
  async openFile(path) {
    throw new Error("Must implement openFile()");
  }
}

class NodeFile extends File { 

  constructor(f, start, end) {
    super(f, start, end);
  }

  async write(data) {
    this._file.write(data);
  }

  async read() {
    const nodeStream = this._file.createReadStream();

    let data = '';
    nodeStream.on('data', (chunk) => {
      console.log("chunk");
      data += chunk;
    });

    await new Promise((resolve, reject) => {
      nodeStream.on('end', (chunk) => {
        resolve();
      });
    });

    return data;
  }

  slice(start, end, contentType) {
    return new NodeFile(this._file, start ? start : this._start, end ? end : this._end);
  }

  stream() {
    const nodeStream = this._file.createReadStream({
      start: this._start,
      end: this._end,
    });

    let done = false;
    let controller;

    const rs = new ReadableStream({

      async start(contr) {
        controller = contr;
      },

      pull(contr) {
        if (contr.desiredSize > 0) {
          nodeStream.resume();
        }
      },

      cancel() {
        nodeStream.close();
        done = true;
      }

    });

    nodeStream.on('data', (chunk) => {
      if (controller.desiredSize > 0) {
        controller.enqueue(chunk);
      }
      else {
        nodeStream.pause();
      }
    });

    nodeStream.on('close', (chunk) => {
      if (!done) {
        controller.close();
        done = true;
      }
    });

    return rs;
  }
}
//
//class DenoFile extends File {
//  constructor(f, start, end) {
//    super(f, start, end);
//
//    this._reader = null;
//  }
//
//  slice(start, end, contentType) {
//    return new DenoFile(this._file, start ? start : this._start, end ? end : this._end);
//  }
//
//  stream() {
//
//    const self = this;
//
//    if (this._start !== undefined) {
//      return new ReadableStream({
//
//        async start(controller) {
//          await self._file.seek(self._start, Deno.SeekMode.Start);
//          self._reader = self._file.readable.getReader();
//
//        },
//
//        async pull(controller) {
//          const { value, done } = await self._reader.read();
//          if (done) {
//            controller.close();
//          }
//          else {
//            controller.enqueue(value);
//          }
//        }
//      });
//    }
//    else {
//      return this._file.readable;
//    }
//  }
//}
//
//class BunFile {
//  constructor(blob) {
//    this._blob = blob;
//    this._reader = null;
//  }
//
//  get size() {
//    return this._blob.size;
//  }
//
//  slice(start, end, contentType) {
//    return new BunFile(this._blob.slice(start, end, contentType));
//    //return new BunFile(this._blob, start ? start : this._start, end ? end : this._end);
//  }
//
//  stream() {
//
//    const self = this;
//
//    return new ReadableStream({
//
//      async start(controller) {
//        self._reader = self._blob.stream().getReader();
//      },
//
//      async pull(controller) {
//        const { value, done } = await self._reader.read();
//        if (done) {
//          controller.close();
//        }
//        else {
//          controller.enqueue(value);
//        }
//      }
//    });
//  }
//}

class BrowserDirectoryTree extends DirectoryTree {
  constructor() {
    const rootPath = '/';
    super(rootPath);

    this._files = {};
  }

  async openFile(path) {
    if (this._files[path] !== undefined) {
      return this._files[path];
    }
    else {
      throw new Error("No such file: " + path);
    }
  }

  addFiles(files) {
    for (const file of files) {
      this._files['/' + file.name] = file;
    }
  }

  async selectFiles() {
    const files = await new Promise((resolve, reject) => {
      const fileInput = document.createElement('input');
      fileInput.setAttribute('type', 'file');
      fileInput.setAttribute('hidden', '');
      fileInput.setAttribute('multiple', '');
      document.body.appendChild(fileInput);

      fileInput.addEventListener('change', (evt) => {
        resolve(fileInput.files);
        document.body.removeChild(fileInput);
      });

      fileInput.click();
    });

    this.addFiles(files);

    return files;
  }
}

class NodeDirectoryTree extends DirectoryTree {

  #ready;

  constructor(rootPath) {
    super(rootPath);

    this.#ready = fs.mkdir(rootPath, { recursive: true });
  }

  async readFile(path, opt) {
    const absPath = nodePath.join(this._rootPath, path);
    return fs.readFile(absPath, opt);
  }

  async writeFile(path, data, opt) {
    const absPath = nodePath.join(this._rootPath, path);
    await fs.mkdir(nodePath.dirname(absPath), { recursive: true });
    return fs.writeFile(absPath, data, opt);
  }

  async removeFile(path) {
    const absPath = nodePath.join(this._rootPath, path);
    await fs.rm(absPath);
  }

  // TODO: CRITICAL: path security
  async openFile(path) {

    await this.#ready;

    const absPath = nodePath.join(this._rootPath, path);
    await fs.mkdir(nodePath.dirname(absPath), { recursive: true });
    const f = await fs.open(absPath, 'w+'); 
    const fileInfo = await f.stat();
    return new NodeFile(f, 0, fileInfo.size);
  }
}

//class DenoDirectoryTree extends DirectoryTree {
//  constructor(rootPath) {
//    super(rootPath);
//  }
//
//  async openFile(path) {
//    const denoPath = await import("https://deno.land/std@0.214.0/path/mod.ts");
//    const absPath = denoPath.join(this._rootPath, path);
//    const f = await Deno.open(absPath, { read: true, write: false });
//    const fileInfo = await f.stat();
//    return new DenoFile(f, 0, fileInfo.size);
//  }
//}
//
//class BunDirectoryTree extends DirectoryTree {
//  constructor(rootPath) {
//    super(rootPath);
//  }
//
//  async openFile(path) {
//    const bunPath = await import('path');
//    const absPath = bunPath.join(this._rootPath, path);
//    const f = await Bun.file(absPath);
//    // TODO: wrapping in a Response is a hack because Bun file blobs are
//    // currently broken for range requests:
//    // https://github.com/oven-sh/bun/issues/7057
//    const blob = await new Response(f.stream()).blob();
//    return blob;
//    //return new BunFile(f);
//  }
//}


async function openFile(path) {
  switch (runtime) {
    case RUNTIME_BROWSER: {
      return new Promise((resolve, reject) => {
        const fileInput = document.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('hidden', '');
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', (evt) => {
          resolve(fileInput.files[0]);
          document.body.removeChild(fileInput);
        });

        fileInput.click();
      });
      break;
    }
    //case RUNTIME_NODE: {
    //  const fs = await import('fs');
    //  const f = await fs.promises.open(path); 
    //  return new NodeFile(f);
    //  break;
    //}
    //case RUNTIME_DENO: {
    //  // TODO: need to close the files we're opening
    //  const f = await Deno.open(path);
    //  const fileInfo = await f.stat();
    //  return new DenoFile(f, 0, fileInfo.size);
    //  break;
    //}
    //case RUNTIME_BUN: {
    //  const f = Bun.file(path);
    //  //return new BunFile(f);
    //  return f;
    //  break;
    //}
  }
}

function openDirectory(path) {
  switch (runtime) {
    case RUNTIME_BROWSER: {
      return new BrowserDirectoryTree();
      break;
    }
    case RUNTIME_NODE: {
      return new NodeDirectoryTree(path);
      break;
    }
    case RUNTIME_DENO: {
      return new DenoDirectoryTree(path);
      break;
    }
    case RUNTIME_BUN: {
      return new BunDirectoryTree(path);
      break;
    }
    default: {
      throw new Error("Runtime not implemented:" + runtime);
      break;
    }
  }
}

function detectRuntime() {
  let runtime = RUNTIME_BROWSER;
  if (typeof process !== 'undefined' && process.versions.bun !== undefined) {
    runtime = RUNTIME_BUN;
  }
  else if (isNode()) {
    runtime = RUNTIME_NODE;
  }
  else if (window.Deno !== undefined) {
    runtime = RUNTIME_DENO;
  }
  return runtime;
}

function isNode() {
  return (typeof process !== 'undefined' && process.release.name === 'node');
}

export {
  openFile,
  openDirectory,
}
