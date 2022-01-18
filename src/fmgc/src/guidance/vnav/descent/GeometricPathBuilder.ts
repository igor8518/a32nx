import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

export class GeometricPathBuilder {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    buildGeometricPath(profile: BaseGeometryProfile) {
        const decelPoint = profile.findVerticalCheckpoint(VerticalCheckpointReason.Decel);

        profile.checkpoints.push({ ...decelPoint, reason: VerticalCheckpointReason.GeometricPathStart });
        profile.checkpoints.push({ ...decelPoint, reason: VerticalCheckpointReason.GeometricPathEnd });
    }
}
