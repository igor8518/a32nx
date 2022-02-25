export class WindVector {
    constructor(public direction: DegreesTrue, public velocity: Knots) {
        Avionics.Utils.clampAngle(direction);

        if (velocity < 0) {
            this.flipDirection();
            this.velocity *= -1;
        }
    }

    private flipDirection() {
        if (this.direction < 180) {
            this.direction += 180;
        }

        this.direction -= 180;
    }

    static default(): WindVector {
        return new WindVector(0, 0);
    }
}

export interface WindVectorAtAltitude {
    vector: WindVector,
    altitude: Feet,
}

export interface WindMeasurement {
    wind: WindVectorAtAltitude,
    distanceFromStart: NauticalMiles
}

export class WindComponent {
    /**
     *
     * @param value +ve for a tailwind, -ve for headwind
     */
    constructor(public value: number) { }

    static fromVector(vector: WindVector, planeHeading: DegreesTrue): WindComponent {
        return new WindComponent(vector.velocity * Avionics.Utils.diffAngle(vector.direction, planeHeading));
    }
}
