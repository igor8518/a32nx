import { DisplayComponent, FSComponent, VNode } from 'msfssdk';

type VerticalDeviationIndicatorProps = {
    deviation: number,
    isLatched: boolean,
}

export class VerticalDeviationIndicator extends DisplayComponent<VerticalDeviationIndicatorProps> {
    onAfterRender(node: VNode): void {
        super.onAfterRender(node);
    }

    render(): VNode {
        const pixelOffset = this.pixelOffsetFromDeviation(this.props.deviation);

        return (
            <g id="VerticalDeviationIndicator">
                <path d={`m119.5 ${80.8 + pixelOffset} a1.5 1.5 0 1 0-3 0 1.5 1.5 0 1 0 3 0z`} class="Fill Green" />
                {this.props.isLatched && <path d={`m119 ${78.3 + pixelOffset} h -3 v 5 h 3`} class="Magenta" />}
            </g>
        );
    }

    private pixelOffsetFromDeviation(deviation: number) {
        return deviation * 15 / 500;
    }
}
