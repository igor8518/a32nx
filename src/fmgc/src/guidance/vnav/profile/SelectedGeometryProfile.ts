import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { DescentAltitudeConstraint, MaxAltitudeConstraint, MaxSpeedConstraint, VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

export class SelectedGeometryProfile extends BaseGeometryProfile {
    public override maxAltitudeConstraints: MaxAltitudeConstraint[] = [];

    public override descentAltitudeConstraints: DescentAltitudeConstraint[];

    public override maxSpeedConstraints: MaxSpeedConstraint[] = [];

    public override descentSpeedConstraints: MaxSpeedConstraint[] = [];

    public override distanceToPresentPosition: number = 0;

    private checkpointsToShowAlongFlightPlan: Set<VerticalCheckpointReason> = new Set([
        VerticalCheckpointReason.TopOfClimb,
        VerticalCheckpointReason.CrossingSpeedLimit,
    ])

    getCheckpointsToShowOnTrackLine(): VerticalCheckpoint[] {
        return this.checkpoints.filter((checkpoint) => this.checkpointsToShowAlongFlightPlan.has(checkpoint.reason));
    }
}
