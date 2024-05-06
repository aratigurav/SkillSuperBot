/**
 * A helper class that loads Skills information from configuration.
 */
export class SkillsConfiguration {
    private skillsData: { [id: string]: any };
    private skillHostEndpointValue: string;

    constructor() {
        this.skillsData = {};

        // Note: we only have one skill in this sample but we could load more if needed.
        const botFrameworkSkill = {
            id: process.env.SKILL_ID,
            appId: process.env.SKILL_APP_ID,
            skillEndpoint: process.env.SKILL_ENDPOINT,
        };

        this.skillsData[botFrameworkSkill.id] = botFrameworkSkill;

        this.skillHostEndpointValue = process.env.SKILL_HOST_ENDPOINT!;
        if (!this.skillHostEndpointValue) {
            throw new Error('[SkillsConfiguration]: Missing configuration parameter. SkillHostEndpoint is required');
        }
    }

    get skills(): { [id: string]: any } {
        return this.skillsData;
    }

    get skillHostEndpoint(): string {
        return this.skillHostEndpointValue;
    }
}

//export { SkillsConfiguration };
