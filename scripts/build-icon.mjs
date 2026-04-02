/**
 * 从 resources/app-icon.svg 生成 build/icon.ico（Windows 安装包 / 窗口）与 build/icon.png。
 * 依赖：sharp、to-ico（devDependencies）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'resources', 'app-icon.svg')
const outDir = join(root, 'build')
const svg = await readFile(svgPath)

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(svg).resize(s, s).png({ compressionLevel: 9 }).toBuffer())
)

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'icon.ico'), await toIco(pngBuffers))
await writeFile(join(outDir, 'icon.png'), await sharp(svg).resize(256, 256).png().toBuffer())

console.log('Wrote build/icon.ico and build/icon.png')
