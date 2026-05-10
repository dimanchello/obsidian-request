export interface Variable {
    key: string;
    value: string;
    enabled: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: Variable[];
}

export interface ExtractionRule {
    id: string;
    name: string;
    jsonPath: string;
    targetEnvironmentId?: string;
}

export interface RequestItem {
    id: string;
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
    url: string;
    headers: Variable[];
    queryParams: Variable[];
    bodyType: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw';
    bodyRaw: string;
    bodyFormData: { key: string; value: string; type: 'text' | 'file'; enabled: boolean }[];
    extractionRules: ExtractionRule[];
}

export interface CollectionData {
    environments: Environment[];
    requests: RequestItem[];
    activeEnvironmentId: string | null;
}
