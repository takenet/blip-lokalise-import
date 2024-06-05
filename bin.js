#!/usr/bin/env node
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const ts = require('typescript');
const config = require(`${process.cwd()}/lokalise-import-conf.json`);

const VARIANT_KEY = '__variant';

const API_KEY_VARIABLE = 'LOKALISE_API_KEY';
const API_KEY = process.env[API_KEY_VARIABLE];
const API_PAGE_LIMIT = 500;

if (!API_KEY) {
    console.log(`${API_KEY_VARIABLE} variable not found! Please set it before importing.`);
    return;
}

const setPathValue = (obj, path, value) => {
    const splitted = path.split('.');
    for (let i = 0; i < splitted.length; i++) {
        let k = splitted[i];

        if (i == splitted.length -1)
            obj[k] = value;
        else {
            if (!obj.hasOwnProperty(k))
                obj[k] = {};

            obj = obj[k];
        }
    }
};

const importProject = async (id) => {
    const translations = {};
    let page = 1;
    
    while (page && page < 999) {
        const response = await fetch(`https://api.lokalise.com/api2/projects/${id}/keys?disable_references=1&include_translations=1&limit=${API_PAGE_LIMIT}&page=${page}`, {
            headers: {
                'X-Api-Token': API_KEY
            }
        });

        const responseJson = await response.json();
        const projectKeys = responseJson.keys;
        
        projectKeys.forEach(projectKey => {
            const key = projectKey.key_name.web
                    || projectKey.key_name.ios
                    || projectKey.key_name.android
                    || projectKey.key_name.other;

            projectKey.translations.map(variant => {
                setPathValue(translations, `${variant.language_iso}.${key}`, variant.translation);
            });
        });

        if (projectKeys.length < API_PAGE_LIMIT)
            break;
        else
            page++;
    }

    return translations;
};

const writeOut = async (project, translations, variant) => {
    let fileContent = JSON.stringify(translations, null, 4);

    if (!project.destination)
        project.destination = `${project.name || project.id}.json`;

    if (project.destination.includes('.ts')) {
        fileContent = `export const translations = ${fileContent.replace(/"([^"]+)":/g, '$1:')};`;

        const errors = [];
        ts.transpile(fileContent, {}, undefined, errors);
        
        if (errors.length) {
            console.log(`The TypeScript output file for project ${project.name || project.id} could not be generated properly!`);
            return;
        }
    }

    let filePath = project.destination;
    
    if (variant)
        filePath =  project.destination.replace(VARIANT_KEY, variant);

    const fullPath = `${process.cwd()}/${filePath}`;
    const directory = fullPath.replace(/[\/\\][^\/\\]+[\/\\]?$/, '');

    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

    writeFileSync(fullPath, fileContent); 
};

const run = async () => {
    let projects = config.projects;

    const projectArgFull = process.argv.find(a => a.includes('project'));
    const projectArg = projectArgFull && projectArgFull.split('=')[1];

    if (projectArg) {
        const project = config.projects.find(p => p.id == projectArg || p.name == projectArg);

        if (!project) {
            console.log(`No configuration for project ${projectArg} was found!`);
            return;
        }
        
        projects = [project];
    }

    for (let project of projects) {
        const translations = await importProject(project.id);

        if (project.destination.includes(VARIANT_KEY)) {
            for (let variant in translations)
                await writeOut(project, translations[variant], variant);
        }
        else
            await writeOut(project, translations);
    }
};

run().then(() => console.log('Done!'));