#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionPattern = /^version:\s*(['"]?)([^'"\n]+)\1\s*$/m

function findCodemodYamlFiles(directory) {
  const paths = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue

    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(...findCodemodYamlFiles(path))
    } else if (entry.isFile() && entry.name === 'codemod.yaml') {
      paths.push(path)
    }
  }

  return paths
}

for (const yamlPath of findCodemodYamlFiles(join(root, 'codemods'))) {
  const dir = dirname(yamlPath)
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const content = readFileSync(yamlPath, 'utf8')
  const updated = content.replace(versionPattern, `version: "${version}"`)

  if (updated !== content) {
    writeFileSync(yamlPath, updated)
    console.log(`${relative(root, yamlPath)} -> ${version}`)
  }
}
